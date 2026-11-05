"""Study Buddy / anonymous aggregate reanalysis.
Usage: python reanalyze.py '/path/to/original.xlsx'
Dependencies: artifact_tool numpy scipy statsmodels
The original xlsx is not bundled in the public static app.
"""
import sys
import numpy as np
from scipy import stats
from statsmodels.api import OLS, add_constant
from artifact_tool import Blob, SpreadsheetFile

if len(sys.argv) != 2:
    raise SystemExit('Usage: python reanalyze.py original.xlsx')
wb = SpreadsheetFile.import_xlsx(Blob.load(sys.argv[1]))
raw = wb.worksheets.get_item('Sheet2').get_range('A1:AL136').values
keys, values = raw[0], raw[1:]
records = [dict(zip(keys, row)) for row in values]
n = len(records)
if not n:
    raise SystemExit('No responses')
print(f'回答数: {n}')
cols = ('学習計画', '集中度', '学習開始固定', '平日学習_分', '平日睡眠_分', 'スクリーン時間_分', 'モチベーション', '休憩_分')
series = {col: np.array([float(r[col]) if isinstance(r[col], (float,int)) else np.nan for r in records]) for col in cols}
for x,y in (
    ('学習計画','集中度'),('学習開始固定','平日学習_分'),('学習計画','平日学習_分'),
    ('学習開始固定','集中度'),('モチベーション','学習計画'),('モチベーション','集中度'),
    ('平日睡眠_分','集中度'),('休憩_分','集中度'),('スクリーン時間_分','平日学習_分')):
    print(f'{x} × {y}: rho={stats.spearmanr(series[x], series[y]).statistic:.3f}')

year2 = np.array([r['学年'] == '２年' for r in records], dtype=float)
year3 = np.array([r['学年'] == '３年' for r in records], dtype=float)
for y, xs in (
    ('集中度', ('学習計画','学習開始固定','モチベーション','スクリーン時間_分','平日睡眠_分')),
    ('平日学習_分', ('学習開始固定','学習計画','モチベーション','スクリーン時間_分')),
):
    matrix = np.column_stack([np.ones(n), *(series[x] for x in xs), year2, year3])
    mask = np.isfinite(series[y]) & np.all(np.isfinite(matrix),axis=1)
    result = OLS(series[y][mask],matrix[mask]).fit(cov_type='HC3')
    print(f'\n目的変数: {y}   n={mask.sum()}, R²={result.rsquared:.3f}')
    for name,coef,ci,p in zip(('切片',*xs,'2年','3年'),result.params,result.conf_int(),result.pvalues):
        print(f' {name}: {coef:+.3f}  95%CI [{ci[0]:+.3f}, {ci[1]:+.3f}]  p={p:.5f}')
