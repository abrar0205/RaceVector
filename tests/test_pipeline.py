from datetime import datetime, timezone
from pipeline.ingest import valid_laps, clean_car
from ml.dataset import build_windows, split_by_meeting
from ml.forecast import RaceVectorTCN
import torch
import numpy as np
import pytest


def test_race_laps_reject_invalid():
    raw=[{'driver_number':1,'lap_duration':73.12,'date_start':'2024-01-01T00:00:00Z','is_pit_out_lap':False},
         {'driver_number':1,'lap_duration':70.1,'date_start':None},
         {'driver_number':2,'lap_duration':99.5,'date_start':'2024-01-01T00:00:00Z','is_pit_out_lap':True}]
    result=valid_laps(raw,{1,2},1)
    assert len(result)==1 and result[0]['lap_duration']==73.12


def test_clean_car_validates_speed():
    start=datetime(2024,1,1,tzinfo=timezone.utc)
    raw=[{'date':'2024-01-01T00:00:01Z','speed':120,'throttle':40,'brake':False,'rpm':10000,'n_gear':3},
         {'date':'2024-01-01T00:00:02Z','speed':700}]
    out=clean_car(raw,start,5)
    assert len(out)==1 and out[0]['speed']==120


def test_windows_do_not_bridge_gaps():
    # Synthetic values are allowed in isolated unit tests, never shipped as a public session.
    lap={'car':[{'t':float(i)*.5,'speed':140+i,'throttle':50,'brake':0,'gear':5,'rpm':10000} for i in range(50)]}
    x,y=build_windows(lap)
    assert x.shape[1:]==(12,5) and x.shape[0]==y.shape[0] and len(y)>20
    lap['car']=[p for p in lap['car'] if not (7.5<p['t']<17)]
    x2,y2=build_windows(lap)
    assert len(y2)<len(y)


def test_meeting_holdout_is_disjoint():
    splits,groups=split_by_meeting([{'meeting_key':i} for i in range(8)],seed=42)
    assert set(groups['train']).isdisjoint(groups['test'])
    assert set(groups['train']).isdisjoint(groups['val'])
    assert sum(map(len,splits.values()))==8
    with pytest.raises(ValueError):split_by_meeting([{'meeting_key':1}])


def test_neural_shapes_and_gradients():
    model=RaceVectorTCN()
    output,latent=model(torch.rand(3,12,5))
    assert output.shape==(3,) and latent.shape==(3,32)
    output.mean().backward()
    assert model.head[-1].weight.grad is not None
