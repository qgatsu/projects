# ファイル例: Ebuiss_admin/ebuiss_admin.py

import pandas as pd
from ..backtester.backtester import Backtester
from ..evaluator.evaluator import Evaluator
from ..visualizer.visualizer import Visualizer
from ..ebuissdb.ebuissdb import EbuissDB
from ..strategy_driver.strategy_driver import StrategyDriver
from IPython.display import display

class Ebuiss:
    def __init__(self):
        """
        EbuissDBとStrategyDriverを内部に保持し、データ・戦略・バックテスト管理を統括する。
        """
        self.db = EbuissDB()
        self.strategy_driver = StrategyDriver()

        self.backtester = None
        self.evaluator = None
        self.visualizer = None
        self.strategy = None
        self.trade_log = None
        self.metrics = None
        self.chart = None

    ## --- DB操作 ---

    def register_factors(self, df: pd.DataFrame, prefix: str):
        """
        DBにファクターを登録する。
        """
        self.db.register_factors(df, prefix)

    def register_df(self, df: pd.DataFrame, name: str):
        """
        株価DataFrameをDBに登録する。
        """
        self.db.register(name, df)

    def list_factors(self) -> pd.DataFrame:
        """
        DBに登録されているファクター一覧を取得する。
        """
        return self.db.list_factors()

    def list_datas(self) -> pd.DataFrame:
        """
        DBに登録されている通常データ一覧（メタ情報付き）を取得する。
        """
        return self.db.datatable()

    ## --- Strategy管理 ---

    def register_strategy(self, file_path: str, strategy_name: str):
        """
        外部ファイルをstrategyフォルダに登録する。
        """
        self.strategy_driver.register_strategy(file_path, strategy_name)

    def list_strategies(self) -> pd.DataFrame:
        """
        現在利用可能な戦略一覧をDataFrameで取得する。
        """
        return self.strategy_driver.list_available_strategies()

    def load_strategy(self, strategy_name: str):
        """
        strategyフォルダ内から戦略クラスをロードしてインスタンスを返す。
        """
        return self.strategy_driver.load_strategy(strategy_name)

    ## --- Backtester操作 ---

    def run_backtest(self, price_name: str, strategy_name: str, factor_name: str = None, start_date: str = None, end_date: str = None):
        """
        DBとStrategyDriverから必要な情報を取得して、バックテストを実行する。

        Parameters:
            price_name (str): 価格データ名
            strategy_name (str): 戦略名（strategyフォルダ内のクラス名）
            factor_name (str, optional): ファクターデータ名（未指定ならNone）
            start_date (str, optional): バックテスト開始日
            end_date (str, optional): バックテスト終了日
        """
        # データ取得
        price_df = self.db.get(price_name)
        factor_df = self.db.get_factor(factor_name) if factor_name else None

        # インデックスをDatetimeIndexに変換
        price_df.index = pd.to_datetime(price_df.index)

        if factor_df is not None:
            factor_df.index = pd.to_datetime(factor_df.index)

        # 日付フィルタリング
        if start_date:
            price_df = price_df[price_df.index >= pd.to_datetime(start_date)]
            if factor_df is not None:
                factor_df = factor_df[factor_df.index >= pd.to_datetime(start_date)]

        if end_date:
            price_df = price_df[price_df.index <= pd.to_datetime(end_date)]
            if factor_df is not None:
                factor_df = factor_df[factor_df.index <= pd.to_datetime(end_date)]

        # 日付の共通部分に揃える
        if factor_df is not None:
            common_dates = price_df.index.intersection(factor_df.index)
            price_df = price_df.loc[common_dates]
            factor_df = factor_df.loc[common_dates]

        # 銘柄の共通部分に揃える
        if factor_df is not None:
            common_cols = price_df.columns.intersection(factor_df.columns)
            if common_cols.empty:
                raise ValueError("price_dfとfactor_dfに共通する銘柄が存在しません。")
            price_df = price_df[common_cols]
            factor_df = factor_df[common_cols]

        # 戦略クラスをロード
        self.strategy = self.strategy_driver.load_strategy(strategy_name)

        # Backtesterインスタンス作成・実行
        self.backtester = Backtester(
            strategy=self.strategy,
            price_df=price_df,
            factor_df=factor_df,
            exe_cost=self.exe_cost,
            initial_cash=self.initial_cash
        )

        self.backtester.run()
        self.trade_log = self.backtester.get_trade_log()


    def evaluate_result(self):
        """
        評価を実行し、metricsを保存する。
        """
        self.evaluator = Evaluator(self.trade_log, strategy_name=self.strategy.name)
        self.metrics = self.evaluator.evaluate()

    def visualize_result(self, cumulative=True):
        """
        可視化を実行し、チャートを保存する。
        """
        self.visualizer = Visualizer(self.trade_log, strategy_name=self.strategy.name)
        self.chart = self.visualizer.plot_equity_segments(cumulative=cumulative)

    def run(self, strategy_name: str, price_name: str, factor_name: str = None, cumulative: bool = True, exe_cost: float = 0.000, initial_cash: int = 1_000_000, start_date: str = None, end_date: str = None):
        """
        戦略名、価格データ名、ファクターデータ名を指定して一括実行。

        Parameters:
            strategy_name (str): 使用する戦略名
            price_name (str): 使用する価格データ名
            factor_name (str, optional): 使用するファクターデータ名（未指定ならNone）
            cumulative (bool): 資産推移を累積表示するか
            exe_cost (float): 売買コスト率
            initial_cash (int): 初期資金
        Returns:
            trade_log, metrics, chart
        """
        self.exe_cost = exe_cost
        self.initial_cash = initial_cash

        self.run_backtest(price_name=price_name, strategy_name=strategy_name, factor_name=factor_name, start_date=start_date, end_date=end_date)
        self.evaluate_result()
        self.visualize_result(cumulative=cumulative)

        self.chart.show()
        display(self.metrics)

        return self.trade_log, self.metrics, self.chart
