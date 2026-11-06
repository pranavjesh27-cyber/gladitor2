#!/usr/bin/env python3
"""Import route paths and scheduled ride times from the bundled Chennai GTFS feeds."""

from __future__ import annotations

import csv
import heapq
import io
import json
import math
import statistics
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLACES_FILE = ROOT / "data" / "places.json"
COORDS_FILE = ROOT / "data" / "place-coordinates.json"
MAP_OUTPUT = ROOT / "data" / "route-map.json"
JOURNEY_OUTPUT = ROOT / "data" / "gtfs-journeys.json"
PLACE_COORDS = {
    place_id: tuple(point)
    for place_id, point in json.loads(COORDS_FILE.read_text(encoding="utf-8")).items()
}
FEEDS = {
    "bus": ("chennai.bus.gtfs.zip", "CUMTA bus"),
    "metro": ("chennai.metro.gtfs.zip", "CUMTA Metro"),
    "train": ("chennai.suburban.gtfs.zip", "Southern Railway suburban"),
}


def open_feed_archive(filename: str) -> zipfile.ZipFile:
    """Find and open a GTFS feed zip from an extracted Theme folder or a zip bundle."""
    # Check extracted directory locations
    folder_candidates = [
        ROOT / "Theme 1",
        ROOT / "theme",
        ROOT / "Theme",
        ROOT,
    ]
    for folder in folder_candidates:
        candidate = folder / filename
        if candidate.is_file():
            return zipfile.ZipFile(candidate)

    # Check zip bundle archives
    bundle_candidates = [
        ROOT / "Theme 1 (1).zip",
        ROOT / "Theme 1.zip",
        ROOT / "theme.zip",
        ROOT / "Theme.zip",
    ]
    for bundle_path in bundle_candidates:
        if bundle_path.is_file():
            with zipfile.ZipFile(bundle_path) as bundle:
                for name in bundle.namelist():
                    if Path(name).name == filename:
                        return zipfile.ZipFile(io.BytesIO(bundle.read(name)))

    raise FileNotFoundError(
        f"Could not find GTFS feed '{filename}' in 'Theme 1/' folder or zip bundle."
    )


def read_rows(archive: zipfile.ZipFile, filename: str):
    matches = [name for name in archive.namelist() if Path(name).name == filename]
    if not matches:
        raise KeyError(f"{filename} is missing from the GTFS feed")
    with archive.open(matches[0]) as source:
        text = io.TextIOWrapper(source, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)


def distance_meters(left: tuple[float, float], right: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, left)
    lat2, lon2 = map(math.radians, right)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def gtfs_seconds(value: str) -> int | None:
    try:
        hours, minutes, seconds = (int(part) for part in value.split(":"))
        return hours * 3600 + minutes * 60 + seconds
    except (ValueError, AttributeError):
        return None


def load_feed(filename: str, mode: str, publisher: str):
    with open_feed_archive(filename) as archive:
        stops: dict[str, dict[str, Any]] = {}
        for row in read_rows(archive, "stops.txt"):
            try:
                lat, lon = float(row.get("stop_lat", "")), float(row.get("stop_lon", ""))
            except (TypeError, ValueError):
                continue
            if not (12.6 <= lat <= 13.3 and 79.8 <= lon <= 80.5):
                continue
            stops[row["stop_id"]] = {
                "name": row.get("stop_name", row["stop_id"]).strip(),
                "point": (lat, lon),
                "parent": row.get("parent_station", "").strip(),
            }

        routes: dict[str, dict[str, str]] = {}
        for row in read_rows(archive, "routes.txt"):
            routes[row["route_id"]] = {
                "short": row.get("route_short_name", "").strip(),
                "long": row.get("route_long_name", "").strip(),
                "color": row.get("route_color", "").strip(),
            }

        feed_info = next(read_rows(archive, "feed_info.txt"), {})
        feed_start = feed_info.get("feed_start_date", "")
        feed_date = f"{feed_start[:4]}-{feed_start[4:6]}-{feed_start[6:8]}" if len(feed_start) == 8 else ""

        # GTFS feeds do not include shapes.txt. Keep a few representative trips for each
        # route and direction to build stop sequences and scheduled in-vehicle durations.
        selected_trips: dict[str, str] = {}
        route_trip_counts: defaultdict[tuple[str, str], int] = defaultdict(int)
        for row in read_rows(archive, "trips.txt"):
            route_id, trip_id = row.get("route_id", ""), row.get("trip_id", "")
            direction = row.get("direction_id", "")
            if route_id in routes and trip_id and route_trip_counts[(route_id, direction)] < 5:
                selected_trips[trip_id] = route_id
                route_trip_counts[(route_id, direction)] += 1

        pattern_rows: defaultdict[str, list[tuple[int, str, str, str]]] = defaultdict(list)
        for row in read_rows(archive, "stop_times.txt"):
            trip_id = row.get("trip_id", "")
            if trip_id not in selected_trips:
                continue
            try:
                sequence = int(row.get("stop_sequence", "0"))
            except ValueError:
                continue
            pattern_rows[trip_id].append((sequence, row.get("stop_id", ""), row.get("departure_time", ""), row.get("arrival_time", "")))

        patterns: defaultdict[str, set[tuple[str, ...]]] = defaultdict(set)
        edge_times: defaultdict[tuple[str, str, str], list[float]] = defaultdict(list)
        for trip_id, rows in pattern_rows.items():
            route_id = selected_trips[trip_id]
            ordered = [row for row in sorted(rows) if row[1] in stops]
            stop_ids = tuple(row[1] for row in ordered)
            if len(stop_ids) < 2:
                continue
            patterns[route_id].add(stop_ids)
            for current, following in zip(ordered, ordered[1:]):
                departure = gtfs_seconds(current[2]) or gtfs_seconds(current[3])
                arrival = gtfs_seconds(following[3]) or gtfs_seconds(following[2])
                if departure is None or arrival is None:
                    continue
                if arrival < departure:
                    arrival += 24 * 3600
                minutes = (arrival - departure) / 60
                if 0 < minutes <= 180:
                    edge_times[(route_id, current[1], following[1])].append(minutes)

        edge_minutes = {key: statistics.median(values) for key, values in edge_times.items()}
        graph: defaultdict[str, dict[str, str]] = defaultdict(dict)
        for route_id, route_patterns in patterns.items():
            for pattern in route_patterns:
                for origin, destination in zip(pattern, pattern[1:]):
                    if origin == destination:
                        continue
                    prior = graph[origin].get(destination)
                    candidate_time = edge_minutes.get((route_id, origin, destination), math.inf)
                    prior_time = edge_minutes.get((prior, origin, destination), math.inf) if prior else math.inf
                    if prior is None or candidate_time < prior_time or (candidate_time == prior_time and route_id < prior):
                        graph[origin][destination] = route_id

        active_stops = set(graph.keys()) | {dest for targets in graph.values() for dest in targets}
        by_parent: defaultdict[str, list[str]] = defaultdict(list)
        for stop_id in active_stops:
            parent_id = stops.get(stop_id, {}).get("parent", "")
            if parent_id:
                by_parent[parent_id].append(stop_id)
        station_siblings = {
            stop_id: [other for other in group if other != stop_id]
            for group in by_parent.values()
            if len(group) > 1
            for stop_id in group
        }

        return {
            "mode": mode,
            "publisher": publisher,
            "feedDate": feed_date,
            "stops": stops,
            "activeStops": active_stops,
            "stationSiblings": station_siblings,
            "routes": routes,
            "graph": graph,
            "edgeMinutes": edge_minutes,
        }


def nearby_stops(point: tuple[float, float], stops: dict[str, dict[str, Any]], active_stops: set[str], limit: int = 6):
    ranked = sorted(
        ((distance_meters(point, stop["point"]), stop_id) for stop_id, stop in stops.items() if stop_id in active_stops),
        key=lambda item: item[0],
    )
    if not ranked or ranked[0][0] > 1_600:
        return []
    cutoff = min(1_600.0, ranked[0][0] + 350.0)
    return [(meters, stop_id) for meters, stop_id in ranked[:limit] if meters <= cutoff]


def shortest_path(
    start: str,
    destinations: set[str],
    graph: dict[str, dict[str, str]],
    edge_minutes,
    station_siblings: dict[str, list[str]],
):
    start_state = (start, "")
    start_score = (0, 0, 0.0)
    queue = [(start_score, start, "")]
    best_scores = {start_state: start_score}
    parent: dict[tuple[str, str], tuple[tuple[str, str], str]] = {}
    reached = None
    while queue:
        score, current, last_route = heapq.heappop(queue)
        state = (current, last_route)
        if score != best_scores.get(state):
            continue
        if current in destinations and last_route:
            reached = state
            break
        changes, hops, ride = score
        for next_stop, route_id in graph.get(current, {}).items():
            next_changes = changes + int(bool(last_route) and route_id != last_route)
            if next_changes > 2:
                continue
            edge_ride = edge_minutes.get((route_id, current, next_stop), 0.0)
            next_score = (next_changes, hops + 1, ride + edge_ride)
            next_state = (next_stop, route_id)
            if next_score >= best_scores.get(next_state, (math.inf, math.inf, math.inf)):
                continue
            best_scores[next_state] = next_score
            parent[next_state] = (state, route_id)
            heapq.heappush(queue, (next_score, next_stop, route_id))
        if last_route:
            for sibling_stop in station_siblings.get(current, ()):
                next_score = (changes, hops + 1, ride)
                next_state = (sibling_stop, last_route)
                if next_score >= best_scores.get(next_state, (math.inf, math.inf, math.inf)):
                    continue
                best_scores[next_state] = next_score
                parent[next_state] = (state, "__transfer__")
                heapq.heappush(queue, (next_score, sibling_stop, last_route))
    if reached is None:
        return None
    stop_ids = [reached[0]]
    route_ids: list[str] = []
    cursor = reached
    while cursor != start_state:
        previous, route_id = parent[cursor]
        route_ids.append(route_id)
        stop_ids.append(previous[0])
        cursor = previous
    return list(reversed(stop_ids)), list(reversed(route_ids))


def find_path(feed: dict[str, Any], origin_id: str, destination_id: str):
    origin, destination = PLACE_COORDS.get(origin_id), PLACE_COORDS.get(destination_id)
    if not origin or not destination:
        return None
    stops, routes, graph = feed["stops"], feed["routes"], feed["graph"]
    active_stops = feed["activeStops"]
    starts, ends = nearby_stops(origin, stops, active_stops), nearby_stops(destination, stops, active_stops)
    if not starts or not ends:
        return None
    best = None
    for start_distance, start_stop in starts:
        found = shortest_path(
            start_stop,
            {stop_id for _, stop_id in ends},
            graph,
            feed["edgeMinutes"],
            feed["stationSiblings"],
        )
        if not found:
            continue
        stop_ids, route_ids = found
        end_stop = stop_ids[-1]
        end_distance = next(meters for meters, stop_id in ends if stop_id == end_stop)
        segment_times = [
            0.0 if route_id == "__transfer__" else feed["edgeMinutes"].get((route_id, start, end))
            for start, end, route_id in zip(stop_ids, stop_ids[1:], route_ids)
        ]
        ride_minutes = sum(segment_times) if all(value is not None for value in segment_times) else None
        real_routes = [route_id for route_id in route_ids if route_id != "__transfer__"]
        route_changes = sum(left != right for left, right in zip(real_routes, real_routes[1:]))
        score = (route_changes, len(stop_ids), ride_minutes if ride_minutes is not None else math.inf, start_distance + end_distance)
        if best is None or score < best[0]:
            best = (score, start_distance, end_distance, stop_ids, real_routes, ride_minutes)
    if best is None:
        return None

    _, start_distance, end_distance, stop_ids, route_ids, ride_minutes = best
    points = [origin]
    for stop_id in stop_ids:
        point = stops[stop_id]["point"]
        if point != points[-1]:
            points.append(point)
    if destination != points[-1]:
        points.append(destination)

    names = []
    line_ids = []
    for route_id in route_ids:
        route = routes[route_id]
        name = route["short"] or route["long"] or route_id
        if not names or names[-1] != name:
            names.append(name)
        if not line_ids or line_ids[-1] != route_id:
            line_ids.append(route_id)
    access_walk = math.ceil((start_distance + end_distance) / 80)
    return {
        "mode": feed["mode"],
        "points": [[round(lat, 6), round(lon, 6)] for lat, lon in points],
        "source": "gtfs-stop-sequence",
        "boardingStop": stops[stop_ids[0]]["name"],
        "alightingStop": stops[stop_ids[-1]]["name"],
        "boardingWalkMeters": round(start_distance),
        "alightingWalkMeters": round(end_distance),
        "accessWalkMinutes": access_walk,
        "routeNames": names[:5],
        "routeIds": line_ids,
        "stopIds": stop_ids,
        "rideMinutes": round(ride_minutes) if ride_minutes is not None and ride_minutes > 0 else None,
        "routeChanges": max(0, len(line_ids) - 1),
        "publisher": feed["publisher"],
        "feedDate": feed["feedDate"],
    }


def build_journey(origin_id: str, destination_id: str, geometry: dict[str, Any]):
    route_names = geometry["routeNames"]
    line_description = ", ".join(route_names)
    if len(geometry["routeIds"]) > len(route_names):
        line_description += ", …"
    if geometry["routeChanges"]:
        line_description += f" · {geometry['routeChanges']} line changes"
    access = geometry["accessWalkMinutes"]
    ride = geometry["rideMinutes"]
    duration = ride + access if ride is not None else None
    mode = geometry["mode"]
    service_name = f"{geometry['publisher']} GTFS · {line_description}"
    return {
        "id": f"gtfs-{mode}-{origin_id}-{destination_id}",
        "originId": origin_id,
        "destinationId": destination_id,
        "legs": [{
            "mode": mode,
            "originId": origin_id,
            "destinationId": destination_id,
            "serviceName": service_name,
            "routeNumber": ", ".join(route_names[:3]),
            "fareINR": None,
            "walkingMinutes": access,
            "waitingMinutes": None,
            "inVehicleMinutes": ride,
        }],
        "totalFareINR": None,
        "estimatedDurationMinutes": duration,
        "transfers": geometry["routeChanges"],
        "source": f"{geometry['publisher']} GTFS stop sequence · access walk estimated; waits and fares unavailable",
        "updatedAt": geometry["feedDate"] or "GTFS static feed",
        "dataStatus": "gtfs",
    }


def main():
    places = json.loads(PLACES_FILE.read_text(encoding="utf-8"))
    place_ids = [place["id"] for place in places if place["id"] in PLACE_COORDS]

    feeds = {
        mode: load_feed(filename, mode, publisher)
        for mode, (filename, publisher) in FEEDS.items()
    }

    map_output: dict[str, Any] = {}
    journey_output: dict[str, list[dict[str, Any]]] = {}
    for origin_id in place_ids:
        for destination_id in place_ids:
            if origin_id == destination_id:
                continue
            pair_journeys = []
            for mode, feed in feeds.items():
                geometry = find_path(feed, origin_id, destination_id)
                if not geometry:
                    continue
                map_output[f"{mode}:{origin_id}:{destination_id}"] = geometry
                pair_journeys.append(build_journey(origin_id, destination_id, geometry))
            if pair_journeys:
                pair_journeys.sort(key=lambda item: item["estimatedDurationMinutes"] if item["estimatedDurationMinutes"] is not None else math.inf)
                journey_output[f"{origin_id}:{destination_id}"] = pair_journeys

    MAP_OUTPUT.write_text(json.dumps(map_output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    JOURNEY_OUTPUT.write_text(json.dumps(journey_output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    modes = {geometry["mode"] for geometry in map_output.values()}
    print(f"Wrote {len(map_output)} GTFS map paths and journeys for {len(journey_output)} place pairs ({', '.join(sorted(modes))}).")


if __name__ == "__main__":
    main()
