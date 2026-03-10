from typing import Dict, List
import pandas as pd
import re
import os

from .hisuiframe import HisuiFrame


class HisuiDB:
    def __init__(self):
        self._frames: Dict[str, HisuiFrame] = {}
        self._meta_table: pd.DataFrame = pd.DataFrame()

    def _update_meta_table(self):
        records = []
        for name, frame in self._frames.items():
            records.append({
                "rows": frame.df.shape[0],
                "cols": frame.df.shape[1],
                "index_names": frame.index,
                "index_dtypes": frame.index_dtype_info,
                "column_names": frame.columns,
                "dtypes": frame.dtype_info,
                "description": frame.description,
                "created_at": frame.created_at,
            })
        self._meta_table = pd.DataFrame(records, index=self._frames.keys())

    def register(self, name: str, df: pd.DataFrame, description: str = "", overwrite: bool = True):
        if name in self._frames and not overwrite:
            raise ValueError(f"'{name}' はすでに登録されています。上書きするには overwrite=True を指定してください。")
        self._frames[name] = HisuiFrame(df=df, name=name, description=description)
        self._update_meta_table()
        self._simple_meta_table = self._meta_table[["description"]].copy()

    @property
    def datanames(self) -> List[str]:
        return list(self._frames.keys())

    def data_names(self) -> List[str]:
        return self.names

    def save_frames(self, names: List[str], path: str):
        os.makedirs(path, exist_ok=True)

        for name in names:
            if name not in self._frames:
                raise KeyError(f"'{name}' は登録されていません。")

            df = self._frames[name].df
            file_path = os.path.join(path, f"{name}.parquet")
            df.to_parquet(file_path)

    def load_file(self, filepath: str, name: str, description: str = "", overwrite: bool = True):
        ext = os.path.splitext(filepath)[1].lower()

        if ext == ".parquet":
            df = pd.read_parquet(filepath)
        elif ext == ".csv":
            df = pd.read_csv(filepath, index_col=0)  # index復元用
        elif ext in [".pkl", ".pickle"]:
            df = pd.read_pickle(filepath)
        else:
            raise ValueError(f"対応していないファイル形式: {ext}")

        self.register(name=name, df=df, description=description, overwrite=overwrite)

    def get(self, name: str) -> pd.DataFrame:
        if name not in self._frames:
            raise KeyError(f"'{name}' は登録されていません。")
        return self._frames[name].df

    def get_frame(self, name: str) -> HisuiFrame:
        if name not in self._frames:
            raise KeyError(f"'{name}' は登録されていません。")
        return self._frames[name]

    def get_info(self, name: str) -> str:
        return self.get_frame(name).summary()

    def get_column(self, name: str, column: str) -> pd.Series:
        df = self.get(name)
        if column not in df.columns:
            raise KeyError(f"'{column}' は '{name}' に存在しないカラムです。")
        return df[column]

    def set_description(self, name: str, description: str):
        self.get_frame(name).description = description
        self._update_meta_table()

    def list_names(self) -> List[str]:
        return list(self._frames.keys())

    def delete(self, name: str):
        if name not in self._frames:
            raise KeyError(f"'{name}' は登録されていません。")
        del self._frames[name]
        self._update_meta_table()

    def search(self, pattern: str) -> List[str]:
        return [name for name in self._frames if re.search(pattern, name)]

    def summarize_all(self) -> str:
        if not self._frames:
            return "登録されたデータはありません。"
        return "\n\n".join([frame.summary() for frame in self._frames.values()])

    def summarize(self, name: str) -> str:
        """指定されたデータの summary を返す（エイリアス）"""
        return self.get_info(name)

    def datatable(self) -> pd.DataFrame:
        return self._meta_table.copy()
    
    def datatable_mini(self) -> pd.DataFrame:
        return self._simple_meta_table.copy()
