"""显式再生 EMA 独立基准；默认测试只读取生成的 JSON，不执行本文件。"""

import json
from importlib.metadata import distribution, version
from pathlib import Path

import pandas as pd
from pandas_ta_classic.overlap.ema import ema


COMMIT = "ba647e0d87bba422deb68e61715d3fc9f68dd399"
SOURCE = f"https://github.com/xgboosted/pandas-ta-classic/blob/{COMMIT}/pandas_ta_classic/overlap/ema.py"
PARAMETERS = {"talib": False, "sma": True, "adjust": False, "offset": 0}


def expected(full, capacity, periods):
    rows = sorted(full.items())
    first = rows[-capacity:][0][0]
    close = pd.Series([value for _, value in rows], index=[index for index, _ in rows], dtype="float64")
    result = {}
    for period in periods:
        values = ema(close, length=period, **PARAMETERS)
        result[str(period)] = [] if values is None else [
            [int(index), float(value)] for index, value in values.items() if index >= first and pd.notna(value)
        ]
    return result


def make_case(name, capacity, periods, initial, steps):
    full = dict(initial[-capacity:])
    sample = {"name": name, "capacity": capacity, "periods": periods, "initial": initial,
              "expected": expected(full, capacity, periods), "steps": []}
    for step in steps:
        if step["kind"] == "reload":
            full = dict(step["rows"][-capacity:])
        else:
            full.update(step["rows"])
        sample["steps"].append({**step, "expected": expected(full, capacity, periods)})
    return sample


def small_case():
    def merge(rows):
        return {"kind": "merge", "rows": rows}

    return make_case("预热、修正、追加、重复覆盖、裁剪与重载", 6, [1, 3, 5], [[0, 10], [1, 20]], [
        merge([[0, 10], [1, 40]]),
        merge([[0, 10], [1, 50], [2, 60]]),
        merge([[0, 10], [1, 50], [2, 60], [3, 80], [4, 40]]),
        merge([[1, 50], [2, 60], [3, 90], [4, 45], [5, 70]]),
        merge([[3, 95], [4, 45], [5, 75], [6, 100], [7, 85]]),
        merge([[3, 95], [4, 45], [5, 75], [6, 100], [7, 85]]),
        merge([[4, 55], [5, 75], [6, 105], [7, 85], [8, 120]]),
        merge([[4, 55], [5, 75], [6, 105], [7, 85], [8, 115]]),
        merge([[7, 85], [8, 115], [9, 95], [10, 130], [11, 110]]),
        {"kind": "reload", "rows": [[20, 80], [21, 120], [22, 90], [23, 130], [24, 100], [25, 140]]},
        merge([[22, 90], [23, 135], [24, 105], [25, 145], [26, 160]]),
    ])


def default_periods_case():
    def price(index):
        return 100 + (index * 17 % 31) * 0.25 + index * 0.125

    initial = [[index, price(index)] for index in range(104)]
    full = dict(initial)
    steps = []

    def merge():
        steps.append({"kind": "merge", "rows": sorted(full.items())[-5:]})

    full[100] += 3.5
    full[102] -= 2.25
    full[103] += 5.125
    merge()
    merge()
    full[103] += 1.375
    full.update((index, price(index)) for index in range(104, 107))
    merge()
    full[104] -= 4
    full[106] += 1.25
    full.update((index, price(index)) for index in range(107, 109))
    merge()
    full = {index: price(index) for index in range(105, 209)}
    steps.append({"kind": "reload", "rows": sorted(full.items())})
    full[205] += 2.375
    full[208] -= 1.25
    full[209] = price(209)
    merge()
    return make_case("EMA14／50／100 的有效值及连续裁剪", 104, [14, 50, 100], initial, steps)


direct_url = json.loads(distribution("pandas-ta-classic").read_text("direct_url.json") or "{}")
if direct_url.get("vcs_info", {}).get("commit_id") != COMMIT:
    raise RuntimeError("请从固定 Git 提交安装 pandas-ta-classic 后再生基准")

reference = {
    "reference": {"source": SOURCE, "commit": COMMIT, "parameters": PARAMETERS,
                  "versions": {name: version(name) for name in ["pandas-ta-classic", "pandas", "numpy"]},
                  "absolute_tolerance": 1e-12, "relative_tolerance": 1e-12},
    "cases": [small_case(), default_periods_case()],
}
path = Path(__file__).with_name("ema-reference.json")
path.write_text(json.dumps(reference, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
print(f"已生成 {path.name}；来源提交 {COMMIT}；依赖版本 {reference['reference']['versions']}")
