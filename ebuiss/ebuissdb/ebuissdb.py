import pandas as pd
from ..hisui.hisuistore import HisuiDB

class EbuissDB(HisuiDB):
    def __init__(self):
        super().__init__()
        self.factor_dict = {}

    def register_factors(self, df: pd.DataFrame, prefix: str):
        """
        ファクターDataFrameとprefixを受け取り、各列をWide形式に変換して保存。
        インデックス名は必ず ['date', 'ticker'] に矯正する。

        Parameters:
            df (pd.DataFrame): MultiIndex(index=[date, ticker] など), columns=[factor1, factor2,...]
            prefix (str): ファクター名に付ける接頭辞
        """
        
        if isinstance(df.index, pd.MultiIndex):
            df.index.names = ["ticker","date"]
        else:
            raise ValueError("登録するファクターはMultiIndex (date, ticker) の形式である必要があります。")
        
        self.register(name=prefix+"_factors",df=df,overwrite=True)

        for col in df.columns:
            series = df[col]
            wide_df = series.unstack().T
            # display(wide_df)
            factor_name = f"{prefix}_{col}"
            self.factor_dict[factor_name] = wide_df

    def get_factor(self, name) -> pd.DataFrame:
        """
        factor_dictからWide形式で取得。

        Parameters:
            prefix (str): ファクター登録時のprefix
            column (str): 元の列名

        Returns:
            pd.DataFrame: index=date, columns=tickerのWide形式DataFrame
        """
        factor_name = name
        if factor_name not in self.factor_dict:
            raise ValueError(f"Factor '{factor_name}' not found in factor_dict.")

        df = self.factor_dict[factor_name]
        return df

    def list_factors(self) -> pd.DataFrame:
        """
        現在登録されているファクター名一覧をDataFrameで返す。

        Returns:
            pd.DataFrame: factor_name列だけを持つテーブル
        """
        factors = list(self.factor_dict.keys())
        return pd.DataFrame({"factor_name": factors})

    def shift_factors(self, shifts: list):
        """
        現在登録されている各ファクターに対して指定されたn期シフト版を作成して保存。

        Parameters:
            shifts (list): シフトさせる期数のリスト (例: [1, 2, 5])
        """
        original_factors = list(self.factor_dict.keys())

        for factor_name in original_factors:
            df = self.factor_dict[factor_name]

            for n in shifts:
                shifted_df = df.shift(n)
                shifted_name = f"{factor_name}_shifted{n}"
                self.factor_dict[shifted_name] = shifted_df
