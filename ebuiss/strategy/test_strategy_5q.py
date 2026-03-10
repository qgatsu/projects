import pandas as pd
from ebuiss.strategy.strategy import Strategy

class test_strategy_5q(Strategy):
    """
    単一のファクターに基づき、上位/下位分位でロング・ショートを行う戦略。
    """
    def __init__(self, n_quantiles=5, long_quantile=4, short_quantile=0, ascending=False,name =  "5分位ロングショート戦略"):
        self.name = name
        self.n_quantiles = n_quantiles
        self.long_quantile = long_quantile
        self.short_quantile = short_quantile
        self.ascending = ascending  # Trueならファクターが小さいほど良いとみなす

    def generate_positions(self, stock_df : pd.DataFrame,factor_df: pd.DataFrame = None) -> pd.DataFrame:
        positions = pd.DataFrame(index=factor_df.index, columns=factor_df.columns)

        for date, row in factor_df.iterrows():
            ranked = row.rank(ascending=self.ascending, method="first")
            quantile_bins = pd.qcut(ranked, self.n_quantiles, labels=False, duplicates="drop")

            pos = pd.Series(0, index=row.index)
            pos[quantile_bins == self.long_quantile] = 1
            pos[quantile_bins == self.short_quantile] = -1

            positions.loc[date] = pos

        return positions
    
    def describe(self) -> str:
        readme =(
            f"この戦略はファクター値に基づいて銘柄を{self.n_quantiles}分位に分類し、\n"
            f"上位 {self.long_q+1} 分位をロング、下位 {self.short_q+1} 分位をショートとするロングショート戦略です。"
        )

        return readme
    
    def get_metadata(self) -> dict:
        meta_dict = {
            "name": "FactorQuantileStrategy",
            "description": self.describe(),
            "params": {
                "n_quantiles": self.n_quantiles,
                "long_q": self.long_q,
                "short_q": self.short_q
            }
        }
        return meta_dict
    
    def get_name(self):
        return self.name
