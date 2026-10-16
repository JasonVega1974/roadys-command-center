# Seed pins still needing a hand-confirmed coordinate

**2026-10-16.** Of the 21 rows the Census geocoder cannot place and that had no OSM tie, 6 cleared a two-source directory bar and are pinned (`fix/seed-pin-directory-batch`). These **15** did not.

The bar each of these failed: two independent directory listings agreeing within 400 m, or one directory listing matching the seed address or phone plus an OSM fuel / truck-stop / convenience facility within 60 m — and the point at least 30 m clear of any motorway or trunk centreline.

For each row below: the seed data as it stands in `ROADYS_STOPS`, a Google Maps link for the seed address, what a directory did give, and why it was not enough. Where a candidate coordinate exists but could not be corroborated, there is a second Maps link to that point so it can be eyeballed.

## P03607 — Cash Magic Truck Stop

| | |
|---|---|
| Address | 1869 Mills Hwy, Breaux Bridge, LA 70517 |
| Phone | (337) 507-2274 |
| Exit | — |
| Company | Jacobs Entertainment, Inc. |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=1869%20Mills%20Hwy%2C%20Breaux%20Bridge%2C%20LA%2C%2070517 |
| Maps (unconfirmed candidate) | [30.244010, -91.958413](https://www.google.com/maps/search/?api=1&query=30.244010%2C-91.958413) |

**Found:** AllStays #90891: "Cash Magic, I-10 Ex 109, 1869 Mills Hwy, Breaux Bridge LA 70517, 337-507-2274" at 30.2440101, -91.9584129 -- the seed address and the seed phone exactly.

**Why it does not clear the bar:** Only that one directory has a coordinate, and OSM maps no facility at the point. ParkAdvisor lists a "Breaux Bridge Truck Stop" at 1911 Mills Hwy with phone 337-507-3837, which is a different housenumber and a different number, so it cannot be used as the second source.

## P03610 — Lucky Magnolia Truck Stop

| | |
|---|---|
| Address | 52396 Hwy 16, Denham Springs, LA 70706 |
| Phone | (225) 664-7595 |
| Exit | — |
| Company | Jacobs Entertainment, Inc. |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=52396%20Hwy%2016%2C%20Denham%20Springs%2C%20LA%2C%2070706 |
| Maps (unconfirmed candidate) | [30.652439, -90.903748](https://www.google.com/maps/search/?api=1&query=30.652439%2C-90.903748) |

**Found:** AllStays #92939: "Lucky Magnolia, 52396 Hwy 16, Denham Springs LA 70706, 225-664-7595" at 30.6524389, -90.9037478 -- the seed address and phone exactly.

**Why it does not clear the bar:** The operator's own site (cashmagiccasino.com) carries a Google Maps link whose ll= is 30.573494, -90.955896 -- about 10 km away, sitting among housenumbers 34807-35055 on LA-16 when the seed is 52396. That is a map centre for the Watson strip, not the business, so the two sources do not agree and OSM maps nothing at either point.

## P03662 — Shop Rite #85

| | |
|---|---|
| Address | 129 Frontage Road, Rayne, LA 70578 |
| Phone | (337) 873-8100 |
| Exit | I-10 Exit 92 |
| Company | Shop Rite Inc. |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=129%20Frontage%20Road%2C%20Rayne%2C%20LA%2C%2070578 |

**Found:** Nothing with a coordinate. AllStays has no Rayne entry matching it (its Rayne listings are Frog City Travel Plaza and I-10 Rayne Travel Center).

**Why it does not clear the bar:** The one OSM "Shop Rite" nearby is at 800 The Boulevard with housenumber 800, against the seed's 129 Frontage Road -- an address conflict, which is why the earlier pass rejected it too.

## P03705 — Mobile Transportation Service-Colorado Springs

| | |
|---|---|
| Address | 30 Mountain Lane, Colorado Springs, CO 80907 |
| Phone | (303) 476-3622 |
| Exit | — |
| Company | Mobile Transportation Group |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=30%20Mountain%20Lane%2C%20Colorado%20Springs%2C%20CO%2C%2080907 |

**Found:** Nothing. This is a Mobile Transportation Group branch -- a truck repair and towing shop, not a fuel stop -- so the truck-stop directories do not list it.

**Why it does not clear the bar:** An OSM free-text search returns "30 Mountain View Lane, Manitou Springs", a different street in a different town from the seed's 30 Mountain Lane, Colorado Springs. The seed phone (303) 476-3622 is the company's Denver head office and is shared with its other branches, so it cannot identify this site.

## P03706 — Mobile Transportation Service-Mission

| | |
|---|---|
| Address | 4101 W. Military Hwy. Suite Z, Mission, TX 78572 |
| Phone | (303) 476-3622 |
| Exit | — |
| Company | Mobile Transportation Group |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=4101%20W.%20Military%20Hwy.%20Suite%20Z%2C%20Mission%2C%20TX%2C%2078572 |

**Found:** Nothing. Same company as P03705; not a fuel stop, so not in the directories.

**Why it does not clear the bar:** The seed street "4101 W. Military Hwy. Suite Z" is a suite in a commercial strip, and the seed phone is again the shared Denver head-office number.

## P03738 — NK TRUCK STOP/Bombay Buffet & Grill

| | |
|---|---|
| Address | 3405 W HIGHWAY 66, Gallup, NM 87301 |
| Phone | (505) 722-9274 |
| Exit | — |
| Company | NK TRUCK STOP |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=3405%20W%20HIGHWAY%2066%2C%20Gallup%2C%20NM%2C%2087301 |
| Maps (unconfirmed candidate) | [35.489854, -108.894687](https://www.google.com/maps/search/?api=1&query=35.489854%2C-108.894687) |

**Found:** AllStays #93079: "Matayas Travel Plaza, 3405 W. Historic Highway 66, Gallup NM 87301, I-40 Ex 16" at 35.4898535, -108.8946867 -- the seed housenumber and street exactly.

**Why it does not clear the bar:** The directory phone 505-863-6700 does not match the seed's (505) 722-9274, the business name is different ("Matayas" vs "NK Truck Stop/Bombay Buffet & Grill"), and OSM maps no facility at the point. That reads like a rebrand or a different tenant at the same address, which needs a human to settle.

## R00205 — Crazy Fred's Truck Stop

| | |
|---|---|
| Address | 2770 W. Old Hwy 66, Golden Valley, AZ 86413 |
| Phone | (928) 753-3834 |
| Exit | I-40, Exit 44 |
| Company | Bargain Brothers Inc |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=2770%20W.%20Old%20Hwy%2066%2C%20Golden%20Valley%2C%20AZ%2C%2086413 |

**Found:** AllStays #91249 carries the right identity -- "Crazy Fred's Truck Stop, 2770 South Highway 66, Kingman AZ 86401, 928-753-3834", the seed phone exactly.

**Why it does not clear the bar:** Its coordinate is 36.1450958, -96.0023638, which is in Oklahoma -- the longitude is wrong by about 18 degrees. The listing is good and the coordinate is unusable, and no second source gave one.

## R01437 — Morehead Shell

| | |
|---|---|
| Address | 3333 Ky Highway 801 S, Morehead, KY 40351 |
| Phone | (606) 783-1828 |
| Exit | Exit 133 I-64 |
| Company | ABSGA LLC |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=3333%20Ky%20Highway%20801%20S%2C%20Morehead%2C%20KY%2C%2040351 |

**Found:** Nothing with a coordinate. AllStays has four Morehead entries (Cave Run Lake Mart, Certified Oil, Downtown BP, Eagle Travel Plaza) and none is a Shell.

**Why it does not clear the bar:** One of those four may be this site under a former brand, but guessing which is not evidence.

## R02229 — Temp-Stop #102

| | |
|---|---|
| Address | 7 Acorn Drive, Eldon, MO 65026 |
| Phone | (573) 392-5510 |
| Exit | — |
| Company | Temp Stop LLC |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=7%20Acorn%20Drive%2C%20Eldon%2C%20MO%2C%2065026 |
| Maps (unconfirmed candidate) | [38.305985, -92.577045](https://www.google.com/maps/search/?api=1&query=38.305985%2C-92.577045) |

**Found:** AllStays #94818: "Temp-Stop, Hwy 54 and Hwy 52, 7 Acorn Rd, Eldon MO 65026, 573-392-5510" at 38.305985, -92.577045 -- the seed address and phone exactly.

**Why it does not clear the bar:** Only one directory, and the nearest thing OSM maps is a Super 8 at 203 m -- no fuel or truck-stop facility at the point, so there is no independent second source.

## R03495 — Garden Inn Truck Plaza-Forest City

| | |
|---|---|
| Address | 27478 Holt 223, Forest City, MO 64451 |
| Phone | (660) 442-0120 |
| Exit | I-29 Exit 79 |
| Company | RB Management Midwest LLC |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=27478%20Holt%20223%2C%20Forest%20City%2C%20MO%2C%2064451 |

**Found:** Nothing. AllStays' only "Garden Inn Truck Plaza" is in Cabool MO, a different town from the seed's Forest City.

**Why it does not clear the bar:** An OSM road search shows Holt County routes are mapped as "Holt 280", "Holt 290", "Holt 295" and so on, so the seed's "Holt 223" is a real road name, but no source placed the business on it.

## R03628 — 80229-KJ's Alpine Phillips 66

| | |
|---|---|
| Address | 15 Boardwalk Drive, Alpine, WY 83128 |
| Phone | (307) 654-9982 |
| Exit | — |
| Company | Parkland USA Corporation |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=15%20Boardwalk%20Drive%2C%20Alpine%2C%20WY%2C%2083128 |
| Maps (unconfirmed candidate) | [43.172208, -111.018552](https://www.google.com/maps/search/?api=1&query=43.172208%2C-111.018552) |

**Found:** AllStays #96609: "KJ Truckstop, Route 89 & Route 26, Alpine WY 83128, 307-654-9982" -- the seed phone exactly -- at 43.1722082, -111.0185524.

**Why it does not clear the bar:** REJECTED by the on-highway test: that coordinate is 0.9 m from the US-26/US-89 trunk centreline. AllStays geocoded the junction in its address, not the lot. OSM has a Chevron 127 m away which may be the site, but nothing ties it to the seed. The seed street is 15 Boardwalk Drive, which neither source mentions.

## R03918 — Stop N Shop #12

| | |
|---|---|
| Address | 27050 S Hwy 133, Richland, MO 65556 |
| Phone | (573) 873-4375 |
| Exit | I-44/Exit 145 |
| Company | HNZZ Investments LLC |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=27050%20S%20Hwy%20133%2C%20Richland%2C%20MO%2C%2065556 |

**Found:** Nothing. Not in AllStays' Missouri listing.

**Why it does not clear the bar:** No source produced a coordinate.

## R04280 — Refuel Pantry-Mauston

| | |
|---|---|
| Address | 1005 Gateway Ave, Mauston, WI 53948 |
| Phone | (608) 847-4384 |
| Exit | I-90/I-94, Exit 69 |
| Company | Liberty Square Gas station Inc |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=1005%20Gateway%20Ave%2C%20Mauston%2C%20WI%2C%2053948 |

**Found:** Nothing. AllStays' two Mauston entries are both Kwik Trip, at 310 E McCoy Blvd and 1504 Superior Ave -- neither is the seed's 1005 Gateway Ave.

**Why it does not clear the bar:** No source produced a coordinate for a Refuel Pantry at Gateway Ave.

## R04497 — Lucky's Truck Stop

| | |
|---|---|
| Address | 52745 West Interstate 8 Frontage Road, Casa Grande, AZ 85193 |
| Phone | (602) 831-8714 |
| Exit | 151 |
| Company | ZFC LLC |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=52745%20West%20Interstate%208%20Frontage%20Road%2C%20Casa%20Grande%2C%20AZ%2C%2085193 |

**Found:** Nothing. Not in AllStays' Arizona listing.

**Why it does not clear the bar:** The seed street "52745 West Interstate 8 Frontage Road" is the kind of frontage-road address that defeats every geocoder in this audit.

## R09601 — Fill Good #17

| | |
|---|---|
| Address | 305 Unionville I.T. Road, Indian Trail, NC 28079 |
| Phone | (704) 893-0994 |
| Exit | I-485, Exit 51B |
| Company | Monroe Oil Company Inc |
| Maps (seed address) | https://www.google.com/maps/search/?api=1&query=305%20Unionville%20I.T.%20Road%2C%20Indian%20Trail%2C%20NC%2C%2028079 |

**Found:** Nothing. Not in AllStays' North Carolina listing; its nearest entries are in Monroe (BP Roadys, Midway Market, Pilot).

**Why it does not clear the bar:** No source produced a coordinate for a Fill Good at 305 Unionville I.T. Road.

## How to apply a coordinate once confirmed

Add the row id and coordinate to a `PINS` dict and run the same surgical writer the other batches use — `scratchpad/pinaudit/apply_directory_batch.py` is the closest template. It locates the row object by id, inserts only `lat`/`lng`, then re-reads the whole array to confirm it still parses to 390 rows and that every coordinate landed where intended. Do not hand-edit `ROADYS_STOPS`: it is a single ~150 KB line.
