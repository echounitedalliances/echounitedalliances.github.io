"""Draw the link-preview cards (1200x630) that Discord, X and search show.

    python web/scripts/make_cards.py

Writes web/public/brand/cards/echo.jpg, the alliance's own card (the Echo 787
over the sea), and one card per division in its colour, <division_code>.png,
from the live divisions list. prerender.mjs points each page at one of them:
a division and all its airlines use the division's card, everything else the
alliance's. Run it again when a division is added, renamed or recoloured.

The site's display face is Anton; Impact is the closest one Windows ships
with, and at card size the difference does not show.
"""
import json
import os
import re
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(WEB)
OUT = os.path.join(WEB, 'public', 'brand', 'cards')
W, H = 1200, 630
FONTS = r'C:\Windows\Fonts'
DISPLAY = os.path.join(FONTS, 'impact.ttf')
TEXT = os.path.join(FONTS, 'bahnschrift.ttf')
DIVISION_URL = {'proxima': 'lior'}  # as lib/alliance.ts; only the file name uses the code


def env():
    vals = {}
    for name in ('.env', '.env.local'):
        p = os.path.join(WEB, name)
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$', line)
                if m:
                    vals[m.group(1)] = m.group(2).strip('\'"')
    return vals


def divisions():
    e = env()
    req = urllib.request.Request(
        e['VITE_SUPABASE_URL'] + '/rest/v1/divisions?select=division_code,division_name,accent_color&order=sort_order',
        headers={'apikey': e['VITE_SUPABASE_ANON_KEY']},
    )
    return json.load(urllib.request.urlopen(req))


def mark(height, colour):
    """The Echo winglets, cut from the app icon, recoloured."""
    icon = Image.open(os.path.join(WEB, 'public', 'brand', 'echo-icon-512.png')).convert('L')
    icon = icon.crop(icon.point(lambda v: 255 if v > 40 else 0).getbbox())
    w = round(icon.width * height / icon.height)
    alpha = icon.resize((w, height), Image.LANCZOS)
    m = Image.new('RGBA', (w, height), colour)
    m.putalpha(alpha)
    return m


def fit(draw, text, path, size, width):
    font = ImageFont.truetype(path, size)
    while draw.textlength(text, font=font) > width and size > 20:
        size -= 4
        font = ImageFont.truetype(path, size)
    return font


def alliance_card():
    photo = Image.open(os.path.join(ROOT, 'socials', 'echo livery b787.png')).convert('RGB')
    scale = H / photo.height * 1.08
    photo = photo.resize((round(photo.width * scale), round(photo.height * scale)), Image.LANCZOS)
    left = photo.width - W - 10
    card = photo.crop((left, 20, left + W, 20 + H))
    # Darken the left for the words, leave the aircraft bright.
    shade = Image.new('L', (W, H))
    sd = ImageDraw.Draw(shade)
    for x in range(W):
        sd.line([(x, 0), (x, H)], fill=round(250 * min(1.0, max(0.0, (820 - x) / 360)) ** 1.2))
    card = Image.composite(Image.new('RGB', (W, H), (5, 5, 5)), card, shade)
    d = ImageDraw.Draw(card)
    card.paste(m := mark(46, (255, 255, 255)), (64, 70), m)
    d.text((64, 150), 'ECHO', font=ImageFont.truetype(DISPLAY, 150), fill=(241, 236, 255))
    d.text((64, 310), 'UNITED ALLIANCES', font=ImageFont.truetype(DISPLAY, 66), fill=(241, 236, 255))
    d.text((66, 410), 'The Airline Simulator alliance', font=ImageFont.truetype(TEXT, 34), fill=(225, 225, 225))
    d.text((66, 540), 'echoalliances.com', font=ImageFont.truetype(TEXT, 26), fill=(170, 170, 170))
    card.save(os.path.join(OUT, 'echo.jpg'), quality=86, optimize=True, progressive=True)


def division_card(code, name, colour):
    rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
    card = Image.new('RGB', (W, H), (5, 5, 5))
    # A soft glow of the division's colour from the right.
    glow = Image.new('RGB', (W, H), (5, 5, 5))
    ImageDraw.Draw(glow).ellipse((700, -260, 1500, 760), fill=tuple(round(c * 0.28) for c in rgb))
    card = Image.blend(card, glow.filter(ImageFilter.GaussianBlur(140)), 1.0)
    d = ImageDraw.Draw(card)
    d.rectangle((0, 0, 14, H), fill=rgb)
    card.paste(m := mark(46, rgb), (70, 70), m)
    d.text((70, 150), 'DIVISION OF ECHO UNITED ALLIANCES', font=ImageFont.truetype(TEXT, 30), fill=(200, 200, 200))
    big = fit(d, name.upper(), DISPLAY, 230, W - 140)
    d.text((66, 200), name.upper(), font=big, fill=rgb)
    d.text((72, 470), 'The Airline Simulator', font=ImageFont.truetype(TEXT, 34), fill=(225, 225, 225))
    d.text((72, 540), 'echoalliances.com/d/' + DIVISION_URL.get(code, code), font=ImageFont.truetype(TEXT, 26), fill=(150, 150, 150))
    card.save(os.path.join(OUT, f'{code}.png'), optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    alliance_card()
    ds = divisions()
    for dv in ds:
        division_card(dv['division_code'], dv['division_name'], dv['accent_color'])
    print('cards:', ', '.join(sorted(os.listdir(OUT))))
