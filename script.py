import json
from datetime import datetime, timedelta
import sys
import os
from icalendar import Calendar, Event

INPUT_JSON = "data.json"
OUTPUT_ICS = "timetable.ics"


PREFERRED_GROUP_NAME = "1CS - group 1"

def ms_to_dt_local(ms: int) -> datetime:
   
    return datetime.fromtimestamp(ms / 1000)

def resolve_name(names, type_id, obj_id):
    return names.get(str(type_id), {}).get(str(obj_id), {}).get("name", "")

def find_group_id_by_name(names, group_name):
    for gid, meta in names.get("1001", {}).items():
        if meta.get("name") == group_name:
            return gid
    return None

def get_semester_anchor(viewable_resource_dates, names):
   
    chosen_start_ms = None

    target_group_id = None
    if PREFERRED_GROUP_NAME:
        target_group_id = find_group_id_by_name(names, PREFERRED_GROUP_NAME)

    if target_group_id and str(target_group_id) in viewable_resource_dates:
        segments = viewable_resource_dates[str(target_group_id)]
        if segments:
            chosen_start_ms = segments[0]["startDate"]

    
    if chosen_start_ms is None:
        for rid, segments in viewable_resource_dates.items():
            for seg in segments:
                if chosen_start_ms is None or seg["startDate"] < chosen_start_ms:
                    chosen_start_ms = seg["startDate"]

    if chosen_start_ms is None:
        raise RuntimeError("Could not determine semester start from viewableResourceDates.")

   
    start_dt = ms_to_dt_local(chosen_start_ms)
    start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_dt

def main(input_json=INPUT_JSON, output_ics=OUTPUT_ICS):

    if not os.path.exists(input_json):
        raise FileNotFoundError(f"Input not found: {input_json}")


    with open(input_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    names = data.get("names", {})
    viewable_resource_dates = data.get("viewableResourceDates", {})

    
    semester_start = get_semester_anchor(viewable_resource_dates, names)

    cal = Calendar()
    cal.add("prodid", "-//CELCAT Timetable Export//lodz.celcat.cloud//")
    cal.add("version", "2.0")

    # Build events
    for ev in data.get("events", []):
        weeks = ev.get("weeks", [])
        if not weeks:
            continue

        
        day_idx = max(0, int(ev.get("dayOfWeek", 1)) - 1)

        start_ms = int(ev.get("startTime", 0))
        start_h = start_ms // (1000 * 60 * 60)
        start_m = (start_ms // (1000 * 60)) % 60
        duration_min = int(ev.get("duration", 0))

        # Resolve names
        # Module (subject) — names["1000"][id]
        module_name = ""
        for m in ev.get("modules", []):
            module_name = resolve_name(names, 1000, m["id"]) or module_name

        # Group — names["1001"][id] (take the first if multiple)
        group_name = ""
        for s in ev.get("studentSets", []):
            group_name = resolve_name(names, 1001, s["id"]) or group_name

        # Staff — names["1002"][id]
        teachers = []
        for sid in ev.get("staff", []):
            tname = resolve_name(names, 1002, sid)
            if tname:
                teachers.append(tname)
        teachers_str = ", ".join(teachers)

        # Room — names["1003"][id]
        room_name = ""
        for fac in ev.get("facilities", []):
            rname = resolve_name(names, 1003, fac["id"])
            if rname:
                room_name = rname

        # Type — names["1105"][eventCategoryId]
        class_type = ""
        cat_id = ev.get("eventCategoryId")
        if cat_id:
            class_type = resolve_name(names, 1105, cat_id)

        # Build one VEVENT per active week
        for week_index, has_class in enumerate(weeks, start=1):
            if not has_class:
                continue

            # Monday of this teaching week:
            week_start = semester_start + timedelta(weeks=week_index - 1)

            # Specific class day:
            class_day = week_start + timedelta(days=day_idx)

            start_dt = class_day.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
            end_dt = start_dt + timedelta(minutes=duration_min)

            summary_parts = []
            if class_type:
                summary_parts.append(f"[{class_type}]")
            if module_name:
                summary_parts.append(module_name)
            summary = " ".join(summary_parts) if summary_parts else f"Class {ev.get('eventId','')}"

            e = Event()
            e.add("summary", summary)
            e.add("dtstart", start_dt)
            e.add("dtend", end_dt)
            e.add("dtstamp", datetime.now())

            desc_lines = []
            if group_name:
                desc_lines.append(f"Group: {group_name}")
            if teachers_str:
                desc_lines.append(f"Teachers: {teachers_str}")
            if room_name:
                desc_lines.append(f"Room: {room_name}")
            desc_lines.append(f"Event ID: {ev.get('eventId','')}")
            e.add("description", "\n".join(desc_lines))

            if room_name:
                e.add("location", room_name)

            cal.add_component(e)

    with open(output_ics, "wb") as f:
        f.write(cal.to_ical())

    print(f"✅ Created {output_ics}")

if __name__ == "__main__":
    in_path = sys.argv[1] if len(sys.argv) > 1 else INPUT_JSON
    out_path = sys.argv[2] if len(sys.argv) > 2 else OUTPUT_ICS
    main(in_path, out_path)
