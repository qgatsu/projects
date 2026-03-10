from abc import ABC, abstractmethod
import pandas as pd
# from ebuiss.strategy.strategy import Strategy

class Strategy(ABC):
    """
    戦略の抽象基底クラス。
    任意の戦略はこのクラスを継承し、generate_positions を実装すること。
    """
    def __init__(self, name="UnnamedStrategy"):
        self.name = name

    @abstractmethod
    def generate_positions(self, stock_df : pd.DataFrame,factor_df: pd.DataFrame = None) -> pd.DataFrame:
        """
        各週の日付 × 銘柄のポジション（1:ロング, -1:ショート, 0:中立）を返す。
        """
        pass

    @abstractmethod
    def describe(self) -> str:
        """
        この戦略の内容や引数について、ユーザーが記述可能なドキュメントを返す。
        """

        readme = "state information of your strategy"
        return readme
    
    @abstractmethod
    def get_metadata(self) -> dict:
        meta_dict ={
        }

        return meta_dict
    
    @abstractmethod
    def get_name(self):
        return self.name 