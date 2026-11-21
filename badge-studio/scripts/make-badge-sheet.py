# 把十枚徽章的主图拼成一张 contact-sheet.png。
# 路径一律相对本文件推导：早期写死成 /Users/abram/...（用户名和仓库根都不对），
# 换机器或换用户就直接 FileNotFoundError。主图用 export-badge-images.mjs 产出的
# <id>.png（3/4 视角、浅底），旧单枚图已按同一脚本重导，不会混进展厅场景旧图。
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

script = Path(__file__).resolve()
root = script.parents[2] / 'deliverables' / 'badges' / 'images'
items = [
    ('reading', '一页之间'), ('cooking', '做饭 · 烟火日常'),
    ('travel', '旅行 · 去有风的地方'), ('meeting', '相见 · 环环相扣'),
    ('contract', '链上 · 完成声明'), ('bronze10', '10 次 · 铜色起步'),
    ('silver50', '50 次 · 银色回响'), ('gold100', '100 次 · 金色共识'),
    ('platinum100', '100 次 · 白金珍藏'), ('diamond100', '100 次 · 钻石微光'),
]
cell_w, cell_h = 400, 452
sheet = Image.new('RGB', (cell_w * 5, cell_h * 2 + 86), '#f2f4ef')
draw = ImageDraw.Draw(sheet)
title_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc', 30)
label_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc', 21)
draw.text((24, 20), 'Do Something · 生活徽章物料系列（DEMO）', font=title_font, fill='#203f32')
for index, (slug, label) in enumerate(items):
    source = root / f'{slug}.png'
    if not source.exists():
        raise SystemExit(f'缺少主图 {source}：先跑 node scripts/export-badge-images.mjs')
    image = Image.open(source).convert('RGB')
    image = ImageOps.contain(image, (400, 400))
    x = (index % 5) * cell_w
    y = (index // 5) * cell_h + 86
    sheet.paste(image, (x, y))
    draw.text((x + 16, y + 408), label, font=label_font, fill='#31493d')
sheet.save(root / 'contact-sheet.png', optimize=True)
print(f'contact-sheet.png 已生成：{root / "contact-sheet.png"}（{sheet.width}×{sheet.height}）')
