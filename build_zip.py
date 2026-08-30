# -*- coding: utf-8 -*-
"""构建脚本：生成 data.js / cards-data.js（占位图或用户素材的 base64）并打包 zip。

替换真实牌面图：把 22 张图放进 assets-src/cards/，命名 {number:02d}-{id}.jpg
（如 00-fool.jpg, 01-magician.jpg ...），重跑本脚本即可。
"""
import base64
import glob
import io
import json
import os
import zipfile

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
SRC_CARDS = os.path.join(ROOT, "TarotCardsimages", "major")
BG_SRC = os.path.join(ROOT, "首页图.jpg")
LOGO_SRC = os.path.join(ROOT, "logo.jpg")

deck = json.load(open(os.path.join(ROOT, "tarot-cards.json"), encoding="utf-8"))
deck.sort(key=lambda c: (0 if c.get("arcana") == "major" else 1, c["number"], c["id"]))

# 小牌花色目录基准编号（22-77），牌面图按 rank 顺序排列
SUIT_BASE = {"wands": 22, "pentacles": 36, "cups": 50, "swords": 64}
RANK_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
              "page", "knight", "queen", "king"]

# ---------- data.js ----------
# PRD 范围：仅 22 张大阿卡纳进入牌堆（图片映射同步裁剪，控制包体）
deck_major = [c for c in deck if c.get("arcana") == "major"]
data_js = "// 由 build_zip.py 生成，源自 tarot-cards.json（22 张大阿卡纳）\n"
data_js += "window.TAROT_DECK = " + json.dumps(deck_major, ensure_ascii=False, separators=(",", ":")) + ";\n"
os.makedirs(DIST, exist_ok=True)
open(os.path.join(DIST, "data.js"), "w", encoding="utf-8").write(data_js)

# ---------- 占位 SVG（assets-src 无图时） ----------
def placeholder_svg(card):
    name, en = card["name"], card["nameEn"]
    num = str(card["number"])
    sym = card.get("element", "air")[:1].upper()
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000" viewBox="0 0 600 1000">
<defs><radialGradient id="g" cx="35%" cy="30%" r="90%">
<stop offset="0%" stop-color="#3a3268"/><stop offset="55%" stop-color="#23204a"/><stop offset="100%" stop-color="#16142e"/>
</radialGradient></defs>
<rect width="600" height="1000" rx="36" fill="url(#g)" stroke="#d9b96c" stroke-width="8"/>
<rect x="26" y="26" width="548" height="948" rx="24" fill="none" stroke="#d9b96c" stroke-opacity="0.35" stroke-width="3"/>
<circle cx="300" cy="360" r="150" fill="none" stroke="#d9b96c" stroke-opacity="0.5" stroke-width="3"/>
<circle cx="300" cy="360" r="110" fill="none" stroke="#d9b96c" stroke-opacity="0.25" stroke-width="2"/>
<text x="300" y="395" font-size="130" text-anchor="middle" fill="#e5c365">&#10022;</text>
<text x="300" y="620" font-size="30" text-anchor="middle" fill="#9a94b8" letter-spacing="8">{num}</text>
<text x="300" y="700" font-size="64" text-anchor="middle" fill="#e5c365" font-family="serif">{name}</text>
<text x="300" y="760" font-size="26" text-anchor="middle" fill="#9a94b8" letter-spacing="4">{en}</text>
<text x="300" y="920" font-size="40" text-anchor="middle" fill="#d9b96c">{sym}</text>
</svg>'''
    return svg.encode("utf-8")

# ---------- 图片压缩工具 ----------
def compress_jpg(path, max_w, quality=80):
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()

# ---------- cards-data.js（base64 内嵌，供展示与 postNote 使用） ----------
def card_image_path(card):
    if card.get("arcana") == "major":
        hits = glob.glob(os.path.join(SRC_CARDS, f"{card['number']:02d}_*.jpg"))
        return hits[0] if hits else None
    suit, rank = card["id"].split("-", 1)
    num = SUIT_BASE[suit] + RANK_ORDER.index(rank)
    suit_cap = suit.capitalize()
    fname = f"{num}_{RANK_EN[RANK_ORDER.index(rank)]}_of_{suit_cap}.jpg"
    return os.path.join(ROOT, "TarotCardsimages", suit, fname)

RANK_EN = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven",
           "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"]

mapping = {}
for card in deck_major:
    path = card_image_path(card)
    if path and os.path.exists(path):
        raw = compress_jpg(path, 640 if card.get("arcana") == "major" else 480, 75)
        mapping[card["id"]] = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
    else:
        raw = placeholder_svg(card)
        mapping[card["id"]] = "data:image/svg+xml;base64," + base64.b64encode(raw).decode()

# 首页背景 + logo（压缩内嵌）
assets = {"bg": None, "logo": None}
if os.path.exists(BG_SRC):
    raw = compress_jpg(BG_SRC, 1080, 78)
    assets["bg"] = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
if os.path.exists(LOGO_SRC):
    raw = compress_jpg(LOGO_SRC, 360, 80)
    assets["logo"] = "data:image/jpeg;base64," + base64.b64encode(raw).decode()

cards_js = "// 由 build_zip.py 生成：牌面图 base64（展示与 postNote 共用）\n"
cards_js += "window.TAROT_IMAGES = " + json.dumps(mapping, separators=(",", ":")) + ";\n"
cards_js += "window.APP_ASSETS = " + json.dumps(assets, separators=(",", ":")) + ";\n"
open(os.path.join(DIST, "cards-data.js"), "w", encoding="utf-8").write(cards_js)

# ---------- 复制页面文件（script 加版本号防缓存） ----------
import hashlib
open(os.path.join(DIST, "app.js"), "w", encoding="utf-8").write(
    open(os.path.join(ROOT, "app.js"), encoding="utf-8").read())
version = hashlib.md5(open(os.path.join(DIST, "app.js"), "rb").read()).hexdigest()[:8]
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
for f in ("data.js", "cards-data.js", "app.js"):
    html = html.replace(f'./{f}', f'./{f}?v={version}')
open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(html)

# ---------- 打包（压缩 dist 内容本身，index.html 在 zip 根） ----------
zip_path = os.path.join(ROOT, "今日塔罗.zip")
if os.path.exists(zip_path):
    os.remove(zip_path)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(DIST)):
        if f.startswith("."):
            continue
        z.write(os.path.join(DIST, f), f)

size_mb = os.path.getsize(zip_path) / 1024 / 1024
print(f"打包完成: {zip_path} ({size_mb:.2f} MB)")
print("内嵌图片:", sum(1 for v in mapping.values() if v.startswith("data:image/jpeg")),
      "张 jpg,", sum(1 for v in mapping.values() if v.startswith("data:image/svg")),
      "张占位 SVG")
