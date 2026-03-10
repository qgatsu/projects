# strategies/quantile_strategy.py

import pandas as pd
from strategy import Strategy

class QuantileLongShortStrategy(Strategy):
    """
    ファクターに基づき、上位をロング、下位をショートする戦略。
    """
    def __init__(self, name="QuantileLongShort", lower_q=0.2, upper_q=0.8):
        self.name = name
        self.lower_q = lower_q
        self.upper_q = upper_q

    def generate_positions(self, price_df: pd.DataFrame, factor_df: pd.DataFrame = None) -> pd.DataFrame:
        if factor_df is None:
            raise ValueError("factor_df is required for QuantileLongShortStrategy")

        pos = pd.DataFrame(0, index=price_df.index, columns=price_df.columns)

        for date in factor_df.index:
            if date not in price_df.index:
                continue  # 念のため日付をそろえる

            score = factor_df.loc[date]
            q_low = score.quantile(self.lower_q)
            q_high = score.quantile(self.upper_q)

            pos.loc[date, score >= q_high] = 1   # 上位 quantile → ロング
            pos.loc[date, score <= q_low] = -1  # 下位 quantile → ショート

        return pos
