from dataclasses import dataclass, field
from datetime import datetime
import pandas as pd
from typing import List, Optional

@dataclass
class HisuiFrame:
    df: pd.DataFrame
    name: str
    description: Optional[str] = ""
    created_at: datetime = field(default_factory=datetime.now)

    columns: List[str] = field(init=False)
    index: List[str] = field(init=False)
    dtype_info: dict[str, str] = field(init=False)
    index_dtype_info: dict[str, str] = field(init=False)  # ★追加

    def __post_init__(self):
        self.columns = list(self.df.columns)
        self.index = list(self.df.index.names)
        self.dtype_info = {col: str(dtype) for col, dtype in self.df.dtypes.items()}
        self.index_dtype_info = {
            name: str(self.df.index.get_level_values(name).dtype)
            for name in self.df.index.names if name is not None
        }

    def summary(self) -> str:
        return (
            f"Dataname: {self.name}\n"
            f"- Description: {self.description}\n"
            f"- Shape: {self.df.shape}\n"
            f"- Columns: {self.columns}\n"
            f"- Index: {self.index}\n"
            f"- Dtypes: {self.dtype_info}\n"
            f"- Created at: {self.created_at.strftime('%Y-%m-%d %H:%M:%S')}"
        )
