import pandas as pd
import plotly.express as px


class Visualizer:
    def __init__(self, trade_log: pd.DataFrame, strategy_name: str = "UnnamedStrategy"):
        self.trade_log = trade_log
        self.strategy_name = strategy_name

    def plot_equity_segments(self, cumulative: bool = True):
        """
        セグメント（buy_ret, sell_ret, etc.）の累積推移を可視化する。
        Plotly形式に変換して描画。
        """
        df = self.trade_log.copy()
        df["datetime"] = pd.to_datetime(df["date"])
        melted = df.melt(id_vars="datetime", value_vars=["buy_ret", "sell_ret", "neutral_ret", "long_short_ret"],
                        var_name="segment", value_name="ret")

        if cumulative:
            melted["value"] = melted["ret"].fillna(0).groupby(melted["segment"]).cumsum()
        else:
            melted["value"] = melted["ret"]

        # Plotlyで可視化
        fig = px.line(
            melted,
            x="datetime",
            y="value",
            color="segment",
            title=f"{self.strategy_name} - Segment Performance"
        )


        fig.update_layout(
            xaxis=dict(
                tickformat="%Y-%m",
                tickangle=0 
            )
        )

        return fig

