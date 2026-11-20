"""Train, evaluate and (optionally) export ONNX on real historic F1 telemetry.

Command:
  python -m ml.train --data web/data --out models --epochs 25

Fails if no real measured sessions or fewer than four independent race weekends.
No synthetic substitute, fake metrics, or random 'demo predictions' are generated.
"""
from __future__ import annotations
import argparse
import json
import random
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from .dataset import read_laps, split_by_meeting, gather
from .forecast import RaceVectorTCN, WINDOW, HORIZON_STEPS, STEP_S, FEATURES, SCALES


def metrics(actual, predicted):
    err = (np.asarray(predicted) - np.asarray(actual)) * 380.0
    return {"mae_kmh":float(np.mean(np.abs(err))), "rmse_kmh":float(np.sqrt(np.mean(err * err)))}


def train(args):
    torch.manual_seed(args.seed);np.random.seed(args.seed);random.seed(args.seed)
    torch.set_num_threads(min(4,torch.get_num_threads()))
    laps = list(read_laps(args.data))
    partitions, meetings = split_by_meeting(laps,args.seed)
    data = {name:gather(partitions[name]) for name in ("train","val","test")}
    X_train,y_train=data["train"];X_val,y_val=data["val"];X_test,y_test=data["test"]
    if len(X_train)<100 or len(X_val)<20 or len(X_test)<20:
        raise ValueError('Not enough telemetry windows to evaluate; collect more real laps')
    train_loader=DataLoader(TensorDataset(torch.from_numpy(X_train),torch.from_numpy(y_train)),batch_size=args.batch_size,shuffle=True)
    model=RaceVectorTCN();optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=1e-4)
    loss_fn=nn.SmoothL1Loss()
    val_x=torch.from_numpy(X_val);val_y=torch.from_numpy(y_val)
    best=float('inf');best_state=None;bad=0;history=[]
    for epoch in range(1,args.epochs+1):
        model.train();running=0
        for x,y in train_loader:
            optimizer.zero_grad();prediction,_=model(x)
            loss=loss_fn(prediction,y);loss.backward();nn.utils.clip_grad_norm_(model.parameters(),1.0);optimizer.step()
            running+=loss.item()*len(x)
        model.eval()
        with torch.no_grad():
            pred,_=model(val_x);val_loss=loss_fn(pred,val_y).item()
        history.append({"epoch":epoch,"train_loss":running/len(X_train),"validation_loss":val_loss})
        print(f"Epoch {epoch:02d}: train {running/len(X_train):.6f}, validation {val_loss:.6f}")
        if val_loss<best-1e-6:
            best=val_loss;bad=0;best_state={k:v.detach().clone() for k,v in model.state_dict().items()}
        else:
            bad+=1
            if bad>=args.patience:break
    assert best_state is not None
    model.load_state_dict(best_state);model.eval()
    with torch.no_grad():
        pred,latent=model(torch.from_numpy(X_test))
    pred=pred.numpy();latent=latent.numpy()
    persistence=X_test[:,-1,0]
    report={"source":"OpenF1 historical API","trained_at":datetime.now(timezone.utc).isoformat(),"model":"RaceVectorTCN causal TCN v0.1",
       "task":"predict speed 2 seconds ahead using preceding 6 seconds","features":list(FEATURES),"window_samples":WINDOW,
       "step_seconds":STEP_S,"horizon_seconds":HORIZON_STEPS*STEP_S,"meeting_splits":meetings,
       "n_windows":{name:len(x) for name,(x,_) in data.items()},
       "test_model":metrics(y_test,pred),"test_persistence_baseline":metrics(y_test,persistence),
       "beats_persistence_on_mae":bool(metrics(y_test,pred)['mae_kmh']<metrics(y_test,persistence)['mae_kmh']),
       "notes":"Test examples come exclusively from held-out race weekends. Results are not causal explanations and may not transfer to unseen seasons or car regulations.",
       "training_history":history}
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    torch.save({"state_dict":best_state,"config":{"window":WINDOW,"features":list(FEATURES),"scales":list(SCALES)}},out/'racevector.pt')
    (out/'evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print('Test model:',report['test_model'],'| persistence:',report['test_persistence_baseline'])
    if args.onnx:
        model.eval()
        try:
            torch.onnx.export(model,torch.zeros(1,WINDOW,5),str(out/'racevector.onnx'),input_names=['telemetry_window'],
                output_names=['speed_prediction','latent_activations'],dynamic_axes={'telemetry_window':{0:'batch'},'speed_prediction':{0:'batch'},'latent_activations':{0:'batch'}},opset_version=17,dynamo=False)
            print('ONNX exported to',out/'racevector.onnx')
        except Exception as error:
            print('PyTorch checkpoint and test metrics saved; ONNX export unavailable:',str(error))
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data',default='web/data');p.add_argument('--out',default='models')
    p.add_argument('--epochs',type=int,default=25);p.add_argument('--patience',type=int,default=6)
    p.add_argument('--batch-size',type=int,default=256);p.add_argument('--lr',type=float,default=0.001)
    p.add_argument('--seed',type=int,default=42);p.add_argument('--onnx',action='store_true')
    train(p.parse_args())
