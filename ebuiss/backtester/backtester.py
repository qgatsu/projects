import pandas as pd
import numpy as np

class Backtester:
    def __init__(self, strategy, price_df, factor_df=None, exe_cost=0.001, initial_cash=1_000_000):
        self.strategy = strategy
        self.exe_cost = exe_cost
        self.initial_cash = initial_cash

        # 株価データ（そのまま）
        self.prices = price_df

        # 対数リターンを計算（そのまま日次 or デイトレード単位）
        self.returns_df = np.log(self.prices / self.prices.shift(1)).dropna()

        # ファクターもそのまま合わせる（もしあれば）
        self.factor_df = (
            factor_df.loc[self.returns_df.index]
            if factor_df is not None else None
        )


        self.equity_curve = pd.Series(dtype=float)
        self.trade_log = []

    def run(self):
        """
        戦略に基づくポジションと、週次対数リターンにより資産推移を計算。
        """
        # 戦略からポジションを取得
        positions_df = self.strategy.generate_positions(self.prices, self.factor_df)

        # 銘柄の共通部分だけに整合
        common_cols = self.returns_df.columns.intersection(positions_df.columns)
        positions_df = positions_df[common_cols]
        returns_df = self.returns_df[common_cols]

        # 初期化
        cash = self.initial_cash
        equity_list = []
        prev_pos = pd.Series(0, index=common_cols)

        for date in positions_df.index:
            if date not in returns_df.index:
                continue  # 日付不一致の除外

            pos = positions_df.loc[date].fillna(0)  # NaN補完
            ret = returns_df.loc[date]

            # 各セグメントごとの平均リターン
            buy_ret = ret[pos == 1].mean()
            sell_ret = ret[pos == -1].mean()
            neutral_ret = ret[pos == 0].mean()
            long_short_ret = buy_ret - sell_ret if not np.isnan(buy_ret - sell_ret) else 0

            # 売買回数とコスト
            num_changes = (pos != prev_pos).sum()
            avg_trade_size = cash / pos.count() if pos.count() > 0 else 0
            cost = self.exe_cost * avg_trade_size * num_changes

            # 資産更新
            cash = cash * (1 + long_short_ret) - cost
            equity_list.append(cash)
            prev_pos = pos.copy()

            self.trade_log.append({
                "date": date,
                "cash": cash,
                "buy_ret": buy_ret,
                "sell_ret": sell_ret,
                "neutral_ret": neutral_ret,
                "long_short_ret": long_short_ret,
                "cost": cost
            })

        self.equity_curve = pd.Series(equity_list, index=positions_df.index)

    def get_equity_curve(self):
        return self.equity_curve

    def get_trade_log(self):
        return pd.DataFrame(self.trade_log)

    def summary(self):
        total_ret = self.equity_curve.iloc[-1] / self.initial_cash - 1
        annual_ret = (1 + total_ret) ** (52 / len(self.equity_curve)) - 1
        return {
            "strategy": self.strategy.name,
            "total_return": total_ret,
            "annual_return": annual_ret,
            "final_equity": self.equity_curve.iloc[-1]
        }
