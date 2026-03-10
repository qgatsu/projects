import numpy as np
import pandas as pd

class Evaluator:
    def __init__(self, trade_log: pd.DataFrame, strategy_name: str = "UnnamedStrategy"):
        self.trade_log = trade_log
        self.strategy_name = strategy_name
        self.segments = ["buy_ret", "sell_ret", "neutral_ret", "long_short_ret"]

    def evaluate(self) -> pd.DataFrame:
        results = {}

        for seg in self.segments:
            ret = self.trade_log[seg]
            equity = (1 + ret.fillna(0)).cumprod()
            total_ret = equity.iloc[-1] - 1
            ann_ret = (1 + total_ret) ** (52 / len(ret)) - 1
            ann_std = ret.std() * np.sqrt(52)
            rr = ann_ret / ann_std if ann_std != 0 else np.nan
            win_r = (ret > 0).mean()
            max_dd = ((equity / equity.cummax()) - 1).min()
            calmar = ann_ret / abs(max_dd) if max_dd < 0 else np.nan

            results[seg] = {
                "cum.Ret": total_ret,
                "ann.Ret": ann_ret,
                "ann.Std": ann_std,
                "R/R": rr,
                "Win_R": win_r,
                "Max_DD": max_dd,
                "Calmar Ratio": calmar
            }

        return pd.DataFrame(results).T  # index=segment, columns=metrics
