"""Build data/bars.json from reviewed per-brand research files.

Usage: python3 -I scripts/build-bars.py <research-dir>

<research-dir> holds renthal.json, protaper.json, odi.json and others.json, each a list of
rows captured from the maker's own bend chart (see each row's `source`). This script only
normalises field names and measurement conventions; it never fills a missing dimension.

Normalised fields (mm unless noted):
  width     tip-to-tip
  rise      bar-end height above the clamp section (Renthal B "Height", ODI B "HEIGHT",
            Pro Taper "HEIGHT", Neken centreline Height B, other brands' Height)
  pullback  side-view distance the bar ends sit behind the clamp (Renthal E "Sweep",
            ODI E "SWEEP", Pro Taper "Sweep"/"Pullback")
  knee_rise height to the outer bend where the grip section starts (Renthal C, ODI C,
            Pro Taper "RISE", Zeta/Scar/Tag/Accel/Fly/Moose "Rise", Beta drawing), or null
  center    straight clamp section length (Renthal D, ODI D), or null
  control   straight grip/control section length (Renthal F, ODI F, Pro Taper CONTROL AREA), or null
"""
import json, re, sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'data' / 'bars.json'


def dia(text):
    t = (text or '').lower()
    if '36' in t: return '36mm'
    if t.startswith('1-1/8') or 'oversize' in t or '28.6' in t: return '1-1/8 tapered'
    if t.startswith('3/4'): return '3/4'
    if t.startswith('7/8') or '22' in t: return '7/8'
    if t.startswith('1'): return '1'
    return '1-1/8 tapered'


def use(row):
    t = ' '.join(str(row.get(k) or '') for k in ('category', 'line', 'bend', 'fits')).lower()
    if 'pan america' in t: return 'Road / Adventure'
    if 'v-twin' in t or 'harley' in t or 'cruiser' in t: return 'V-Twin'
    if 'atv' in t or 'quad' in t or 'trx' in t: return 'ATV'
    if 'trial' in t: return 'Trials'
    if re.search(r'mini|pit|pee-wee|micro|\b50\b|\b65\b|\b85\b|one-ten|fifty|kids?|grom', t): return 'Mini'
    if re.search(r'\broad\b|street|touring|adventure|naked|cafe', t): return 'Road / Adventure'
    if 'vintage' in t: return 'Vintage'
    if 'flat track' in t or 'dirt track' in t or 'short track' in t: return 'Flat track'
    return 'MX / Enduro'


def num(v):
    return None if v is None or v == '' else round(float(v), 1)


def slug(*parts):
    s = '-'.join(str(p) for p in parts if p)
    return re.sub(r'[^A-Za-z0-9.]+', '-', s).strip('-')[:110]


def normalise(row):
    brand = row['brand']
    if brand == 'Renthal':
        d = row.get('renthal_dims') or {}
        rise, knee, center, control = num(d.get('B_height', row.get('rise_mm'))), num(d.get('C_rise')), num(d.get('D_clamping_width')), num(d.get('F_control_length'))
        pullback = num(d.get('E_sweep', row.get('pullback_mm')))
    elif brand == 'ODI':
        rise, knee, center, control = num(row.get('height_mm')), num(row.get('rise_mm')), num(row.get('center_width_mm')), num(row.get('control_mm'))
        pullback = num(row.get('pullback_mm'))
    elif brand == 'Pro Taper':
        # rise_mm already holds Pro Taper's HEIGHT (bar ends); its own RISE is the height at the bend.
        rise, knee, center, control = num(row.get('rise_mm')), num(row.get('pt_rise_mm')), num(row.get('center_width_mm')), num(row.get('pt_control_area_mm'))
        pullback = num(row.get('pullback_mm'))
    else:
        label = (row.get('rise_label') or '').lower()
        if label.startswith('rise'):
            # Brands that publish both: Height is the bar ends, Rise is the first bend.
            rise, knee = num(row.get('height_mm')), num(row.get('rise_mm'))
        elif brand == 'Neken' and 'centreline' in label:
            # Neken Height B is measured on the tube centreline, like the 3D model.
            rise, knee = num(row.get('rise_mm')), None
        else:
            rise = num(row.get('height_mm') if row.get('height_mm') is not None else row.get('rise_mm'))
            m = re.search(r'rise at first bend (\d+(?:\.\d+)?)', row.get('notes') or '')
            knee = num(m.group(1)) if m else None
        center, control = num(row.get('center_width_mm')), num(row.get('control_mm'))
        pullback = num(row.get('pullback_mm') if row.get('pullback_mm') is not None else row.get('sweep_mm'))
    return {
        'brand': brand, 'line': row['line'], 'bend': row['bend'], 'part': row.get('part'),
        'dia': dia(row.get('diameter')), 'use': use(row),
        'width': num(row.get('width_mm')), 'rise': rise, 'pullback': pullback,
        'knee_rise': knee if knee is not None and rise is not None and 0 < knee < rise - 3 else None,
        'center': center, 'control': control,
        'backsweep': num(row.get('backsweep_deg')), 'upsweep': num(row.get('upsweep_deg')),
        'fits': row.get('fits'), 'oem_stock_for': row.get('oem_stock_for'),
        'notes': row.get('notes'), 'source': (row.get('source') or '').split(' ')[0].split(';')[0].strip(),
    }


bars, skipped, seen = [], [], set()
for name in ('renthal.json', 'protaper.json', 'odi.json', 'others.json'):
    path = src / name
    if not path.exists():
        print('missing', name); continue
    for row in json.loads(path.read_text()):
        b = normalise(row)
        why = None
        if b['width'] is None or b['rise'] is None or b['pullback'] is None: why = 'missing width, rise or pullback'
        elif not 500 <= b['width'] <= 1000: why = f"width {b['width']} out of range"
        elif not b['source'].startswith('https://'): why = 'no https source'
        if why:
            skipped.append(f"{b['brand']} {b['line']} {b['bend']}: {why}"); continue
        b['id'] = slug(b['brand'], b['line'], b['part'] or b['bend'])
        while b['id'] in seen: b['id'] += '-x'
        seen.add(b['id'])
        bars.append({k: v for k, v in b.items() if v is not None})

# Renthal's WorksFit tool lists these bends as similar to Beta's stock bars.
similar = {'604-01': 'Beta RR 390 2017–2024 stock bar (Renthal WorksFit)', '821-01': 'Beta RR 390 X-Pro 2025 / RS 2024 stock bar (Renthal WorksFit)'}
for b in bars:
    if b['brand'] == 'Renthal' and b['line'] == 'Fatbar' and b.get('part') in similar:
        b['similar_to_stock'] = similar[b['part']]

order = {'MX / Enduro': 0, 'Trials': 1, 'Mini': 2, 'ATV': 3, 'Vintage': 4, 'Flat track': 5, 'Road / Adventure': 6, 'V-Twin': 7}
bars.sort(key=lambda b: (b['brand'], b['line'], order.get(b['use'], 9), b['bend']))
out.write_text(json.dumps({'checked_on': '2026-10-26', 'bars': bars}, ensure_ascii=False, indent=0) + '\n')
print(len(bars), 'bars written to', out)
for s in skipped: print('skipped:', s)
