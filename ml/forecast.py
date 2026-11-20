"""A small causal temporal CNN for short-horizon F1 speed forecasting.

Input [batch, 12 time steps, 5 features], sampled every 0.5s.
Outputs: normalized predicted speed 2s later and the 32-D *actual* hidden state.
The latent output can drive a faithful UI after evaluation and ONNX export.
"""
import torch
from torch import nn

WINDOW = 12
STEP_S = 0.5
HORIZON_STEPS = 4
FEATURES = ("speed", "throttle", "brake", "gear", "rpm")
SCALES = (380.0, 100.0, 1.0, 8.0, 16000.0)


class CausalConv(nn.Module):
    def __init__(self, in_features: int, out_features: int, dilation: int):
        super().__init__()
        self.left_pad = 2 * dilation
        self.conv = nn.Conv1d(in_features, out_features, kernel_size=3, dilation=dilation)
        self.activation = nn.GELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.activation(self.conv(nn.functional.pad(x, (self.left_pad, 0))))


class RaceVectorTCN(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(CausalConv(5, 32, 1), CausalConv(32, 32, 2), CausalConv(32, 32, 4))
        self.head = nn.Sequential(nn.Linear(32, 16), nn.GELU(), nn.Linear(16, 1))

    def forward(self, batch: torch.Tensor):
        features = self.layers(batch.transpose(1, 2))
        latent = features[:, :, -1]
        prediction = self.head(latent).squeeze(-1)
        return prediction, latent
