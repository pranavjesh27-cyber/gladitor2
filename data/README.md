# Chennai transit data

`places.json` contains the bilingual place names and aliases used by the search UI. `place-coordinates.json` stores their GTFS-aligned map pins.

`gtfs-journeys.json` and `route-map.json` are generated from the bus, Metro, and suburban rail feeds inside the `Theme 1/` directory or `Theme 1 (1).zip`. Rebuild both files with `npm run build:data` (or `py -3 scripts/build-route-map.py`) after updating GTFS feeds or mapped place coordinates.

The route generator uses representative GTFS trips to trace their ordered stop coordinates and scheduled ride segments. The feeds do not include `shapes.txt`, so paths follow stop locations. Access walking time is estimated from straight-line distance at 80 metres per minute. A route can combine up to two line changes within a feed; the feeds do not provide transfer waiting times, fares, or live arrivals. Ride durations are based on scheduled trip segments and do not represent a full door-to-door prediction.

Each result identifies its feed and feed start date. The Metro feed contains older feed metadata, so confirm current service details with the operator. The site does not connect to live Chennai One data.

`journeys.json` is a legacy demonstration fixture used by the standalone search behavior examples. The website's provider loads `gtfs-journeys.json` instead.
