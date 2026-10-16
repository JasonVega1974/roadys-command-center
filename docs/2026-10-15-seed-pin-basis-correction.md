# Seed-pin basis correction — L03969, R00244, R00718

**2026-10-15.** Three of the 47 pins landed by `cd297b3`
("fix(travel-planner): 47 more seed pins from TIGER corroborated by OSM road
geometry") were not corroborated by TIGER. **All three coordinates are correct
and stay as they are** — only the recorded basis was wrong. This file exists
because that commit message is merged and cannot be rewritten, and because the
audit's other records (`docs/2026-09-11-seed-pin-audit.csv`, the working files
under `scratchpad/pinaudit/`) are gitignored and so are not a durable record of
anything.

## What was wrong

`scratchpad/pinaudit/collect.py` copied each row's coordinate from the prior
audit into the evidence as a Census match:

```python
if r.get('clat') is not None:
    ev['census'] = {'query': r.get('cen', ''), 'from': 'prior-audit', ...}
```

It did that whether or not the Census geocoder had ever matched the address.
For five rows `clat`/`clng` had come from **OSM**, not Census — the prior pass
had already identified an OSM POI and recorded its position. Rule D then
reverse-geocoded that coordinate, found the road name matched the seed street,
and recorded "two independent datasets agreeing on where the address sits".
It was OSM agreeing with OSM.

The tell is in the data: all five have an empty `cen` (no matched Census
address string) beside a populated `clat`. Two of the five were still open and
unaffected (P03659, R01229 — P03659 is now pinned on a phone match). The three
below had shipped.

## The corrected basis

Each rests on an **OSM POI identity match** — an exact name, or an exact
housenumber plus street — which satisfies the audit's bar on its own, and each
was re-verified on 2026-10-15 against the live OSM object and an independent
trucking directory.

### L03969 — Trexler Travel Center, Allentown PA — `40.5932096, -75.5901755`

- **Was recorded as:** `conf=census`, `corr=census+osm`, "TIGER address on 5829
  Tilgham Street; OSM reverse independently returns 'Tilghman Street'".
- **Actually:** OSM `way/153576569`, name **"Trexler Travel Center"** — an exact
  match for the seed name — tagged `addr:housenumber=5829`,
  `addr:street="Tilghman Street"`, `addr:city=Allentown`. That is the seed
  address; the seed misspells the street as "Tilgham". The shipped pin is 5.0 m
  from the way's true centroid.
- **Second source:** Yelp, TruckerPath and AllStays list Trexler Travel Plaza at
  5829 Tilghman St, Allentown with the seed phone **(610) 395-6000**.
- Census returned no match for this address.

### R00244 — Tiger Truck Stop, Grosse Tete LA — `30.4169167, -91.4359014`

- **Was recorded as:** `conf=census`, `corr=census+osm`, "TIGER address on 76740
  Garner Ln.; OSM reverse independently returns 'Garner Lane'".
- **Actually:** OSM `node/13917553328`, name **"Tiger Truck Stop"**
  (`amenity=fuel`) — an exact match for the seed name. The shipped pin *is* that
  node. Its own address tags read 76730 Garner Lane, ten off the seed's 76740,
  so the name is what identifies it, not the housenumber.
- **Second source:** Yelp lists Tiger Truck Stop Cafe at 76740 Garner Ln, Grosse
  Tete; iExit lists the stop at **I-10 Exit 139**, the seed exit.
- Census returned no match for this address.

### R00718 — Bliss Stinker Truck Stop #74, Bliss ID — `42.9232491, -114.9458916`

- **Was recorded as:** `conf=census`, `corr=census+osm`, "TIGER address on 401 E.
  Hwy 30; OSM reverse independently returns 'US 30;I 84 Business'".
- **Actually:** OSM `node/11155042731`, name and `brand` **"Stinker"**
  (`amenity=fuel`), tagged `addr:housenumber=401`,
  `addr:street="East Highway 30"`, `addr:city=Bliss` — the seed's "401 E. Hwy
  30" exactly. The shipped pin *is* that node.
- **Second source:** MapQuest lists Stinker at 401 Highway 30, Bliss ID with the
  seed phone **(208) 352-4627**; 4RoadService and FindTruckService both list
  "Roady's Bliss Stinker Truck Stop #74" at I-84 Exit 141 / US-30.
- Census returned no match for this address.

## What else was corrected

- The published audit report
  (`https://claude.ai/code/artifact/92182b7d-f016-4aa2-b362-f17a81fc5514`) now
  carries a dated correction notice, and these three rows read
  `osm-poi+directory` instead of `census+osm`. The other 44 rows from that batch
  are untouched and still read `census+osm`, which for them is accurate.
- `scratchpad/pinaudit/decisions.json` was corrected in place, with a
  `basis_corrected` marker per row so a later `decide.py` run that recomputes
  them is detectable.

## Why it will not recur

`scratchpad/pinaudit/decide2.py` gates rule D on the coordinate actually having
come from the Census geocoder:

```python
cen_ok = ev.get('anchor_is_tiger') and (ev.get('census') or {}).get('src') in (
    'fetched', 'prior-audit-census')
```

A row whose only coordinate is OSM-derived is refused as "cannot serve as the
second, independent source" rather than being quietly corroborated against
itself. That behaviour is pinned by a test in
`scratchpad/pinaudit/test_decide2.py`.

**The original `decide.py` still has the bug.** It is superseded, not fixed.
Anything re-run through it will reproduce the wrong basis for these rows.
