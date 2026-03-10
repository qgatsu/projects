# ファイル例: Ebuiss_admin/strategy_driver.py

import importlib.util
import shutil
import os
import pandas as pd

class StrategyDriver:
    def __init__(self, strategy_folder_name="strategy"):
        """
        Ebuissライブラリ内部のstrategyフォルダを直接操作する管理クラス。

        Parameters:
            strategy_folder_name (str): strategyフォルダ名（デフォルト "strategy"）
        """
        base_dir = os.path.dirname(__file__)
        self.strategy_dir = os.path.abspath(os.path.join(base_dir, "..", strategy_folder_name))

        os.makedirs(self.strategy_dir, exist_ok=True)

    def load_strategy(self, strategy_name: str):
        """
        戦略ファイルからクラスをロードしインスタンス化する。

        Parameters:
            strategy_name (str): 戦略クラス名（ファイル名とクラス名が一致する前提）

        Returns:
            Strategyクラスのインスタンス
        """
        strategy_path = os.path.join(self.strategy_dir, f"{strategy_name}.py")

        if not os.path.isfile(strategy_path):
            raise FileNotFoundError(f"指定された戦略ファイルが存在しません: {strategy_path}")

        module_name = strategy_name
        spec = importlib.util.spec_from_file_location(module_name, strategy_path)

        if spec is None:
            raise ImportError(f"Cannot create spec for {strategy_path}")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        if not hasattr(module, strategy_name):
            raise AttributeError(f"クラス {strategy_name} が {strategy_path} に存在しません。")

        cls = getattr(module, strategy_name)
        instance = cls()
        return instance

    def register_strategy(self, file_path: str, strategy_name: str):
        """
        任意のファイルを、strategyフォルダに strategy_name.py としてコピー登録する。
        """
        destination_path = os.path.join(self.strategy_dir, f"{strategy_name}.py")

        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"指定されたコピー元ファイルが存在しません: {file_path}")

        shutil.copy(str(file_path), destination_path)

    def list_available_strategies(self) -> pd.DataFrame:
        """
        strategyフォルダ内の利用可能な戦略ファイル一覧をDataFrameで返す。

        Returns:
            pd.DataFrame: strategy_name列を持つ一覧（拡張子なし）
        """
        files = [f for f in os.listdir(self.strategy_dir) if f.endswith(".py")]
        strategies = [os.path.splitext(f)[0] for f in files]

        return pd.DataFrame({"strategy_name": strategies})
