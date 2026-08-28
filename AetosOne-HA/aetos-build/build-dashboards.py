import json, os
S = "/config/.storage"
ORANGE = "#E6701C"
def st(**kw): return [{k: v} for k, v in kw.items()]

hero = {"type": "iframe", "url": "/local/hero.html", "aspect_ratio": "24%", "grid_options": {"columns": "full"}}
def heading(t): return {"type": "heading", "heading": t, "heading_style": "subtitle"}
def light(e, name, color="amber"):
    return {"type": "custom:mushroom-light-card", "entity": e, "name": name, "icon_color": color,
            "show_brightness_control": True, "use_light_color": False, "collapsible_controls": False, "grid_options": {"columns": 6}}
def me(primary, secondary, icon, color, entity=None, toggle=False):
    c = {"type": "custom:mushroom-template-card", "primary": primary, "secondary": secondary,
         "icon": icon, "icon_color": color, "fill_container": True, "grid_options": {"columns": 6}}
    if entity: c["entity"] = entity
    c["tap_action"] = {"action": "toggle"} if toggle else {"action": "more-info"}
    return c
def chip(entity, color, icon): return {"type": "entity", "entity": entity, "icon_color": color, "icon": icon, "content_info": "name"}
def pic(img): return {"type": "picture", "image": img, "tap_action": {"action": "none"}, "hold_action": {"action": "none"}, "grid_options": {"columns": 4}}

energy = {"type": "custom:button-card", "name": "Energy today", "icon": "mdi:lightning-bolt", "show_state": False,
  "custom_fields": {
    "bars": ("[[[ return `<div style=\"display:flex;align-items:flex-end;gap:4px;height:44px;margin-top:10px\">"
             + "".join("<div style=\"flex:1;height:%d%%;background:%s;border-radius:3px\"></div>" % (h, ("#273A80" if h == 85 else "#C7D0E4")) for h in [40,65,50,85,60,45,70]) + "</div>` ]]]"),
    "val": "[[[ return `<span style=\"font-size:26px;font-weight:600;color:#273A80\">8.4</span> <span style=\"font-size:12px;color:#6B7590\">kWh today</span>` ]]]"},
  "styles": {"card": st(**{"padding": "14px 16px", "border-radius": "14px", "box-shadow": "none", "border": "0.5px solid #E2E7F0"}),
    "grid": st(**{"grid-template-areas": "'n i' 'val val' 'bars bars'", "grid-template-columns": "1fr auto"}),
    "name": st(**{"justify-self": "start", "font-size": "13px", "font-weight": "500", "color": "#1B2340"}),
    "icon": st(**{"width": "20px", "color": ORANGE, "justify-self": "end"}),
    "custom_fields": {"val": st(**{"justify-self": "start", "margin-top": "6px"})}}, "grid_options": {"columns": "full"}}

def M(entity, name, color, **extra):  # full-width mushroom control card
    d = {"entity": entity, "name": name, "icon_color": color, "grid_options": {"columns": 6}}
    d.update(extra); return d

cfg = {"title": "Aetos One", "views": [{
  "title": "Home", "path": "home", "icon": "mdi:shield-half-full", "type": "sections", "max_columns": 2,
  "sections": [
    {"type": "grid", "cards": [hero,
        {"type": "custom:mushroom-chips-card", "alignment": "center", "chips": [
            chip("input_button.aetos_all_lights", "amber", "mdi:lightbulb-group"),
            chip("input_button.aetos_away", "blue", "mdi:shield-lock"),
            chip("input_button.aetos_movie", "purple", "mdi:movie"),
            chip("input_button.aetos_goodnight", "indigo", "mdi:weather-night")], "grid_options": {"columns": "full"}}]},
    {"type": "grid", "cards": [heading("Lights"),
        light("light.living_room", "Living room"), light("light.bedroom", "Bedroom"),
        light("light.kitchen", "Kitchen"),
        dict({"type": "custom:mushroom-fan-card"}, **M("fan.ceiling_fan", "Ceiling fan", "blue", show_percentage_control=True, icon_animation=True))]},
    {"type": "grid", "cards": [heading("Climate & air"),
        dict({"type": "custom:mushroom-climate-card"}, **M("climate.living_room_ac", "Living AC", "blue", show_temperature_control=True, hvac_modes=["off", "cool"])),
        me("Thermostat", "{{ states('input_number.aetos_thermostat') }}°C", "mdi:thermostat", "blue", "input_number.aetos_thermostat"),
        me("Humidity", "{{ states('sensor.humidity') }}%", "mdi:water-percent", "blue", "sensor.humidity"),
        me("CO₂", "{{ states('sensor.co2') }} ppm", "mdi:molecule-co2", "green", "sensor.co2"),
        me("Air quality", "{{ states('sensor.air_quality') }}", "mdi:air-filter", "green", "sensor.air_quality"),
        me("Outdoor", "{{ states('sensor.outdoor_temperature') }}°C", "mdi:sun-thermometer", "orange", "sensor.outdoor_temperature")]},
    {"type": "grid", "cards": [heading("Comfort"),
        dict({"type": "custom:mushroom-cover-card"}, **M("cover.living_blinds", "Living blinds", "blue", show_position_control=True, show_buttons_control=True)),
        dict({"type": "custom:mushroom-cover-card"}, **M("cover.bedroom_curtains", "Bedroom curtains", "blue", show_position_control=True, show_buttons_control=True)),
        me("Living room", "24°C", "mdi:thermometer", "blue", "sensor.living_room_temperature"),
        me("Bedroom", "23°C", "mdi:thermometer", "blue", "sensor.bedroom_temperature")]},
    {"type": "grid", "cards": [heading("Cameras"),
        {"type": "iframe", "url": "/local/cam_video.html", "aspect_ratio": "56%", "grid_options": {"columns": "full"}},
        pic("/local/cam_garden.jpg"), pic("/local/cam_garage.jpg"), pic("/local/cam_living.jpg")]},
    {"type": "grid", "cards": [heading("Sensors"),
        me("Illuminance", "{{ states('sensor.illuminance') }} lx", "mdi:brightness-6", "amber", "sensor.illuminance"),
        me("Lock battery", "{{ states('sensor.lock_battery') }}%", "mdi:battery-70", "green", "sensor.lock_battery"),
        me("Power now", "{{ states('sensor.power_now') }} W", "mdi:flash", "amber", "sensor.power_now"),
        me("Motion", "{{ 'Detected' if is_state('binary_sensor.living_room_motion','on') else 'Clear' }}", "mdi:motion-sensor", "orange", "binary_sensor.living_room_motion"),
        me("Front door", "{{ 'Open' if is_state('binary_sensor.front_door_contact','on') else 'Closed' }}", "mdi:door", "blue", "binary_sensor.front_door_contact"),
        me("Water leak", "{{ 'Leak!' if is_state('binary_sensor.water_leak','on') else 'Dry' }}", "mdi:water-alert", "blue", "binary_sensor.water_leak")]},
    {"type": "grid", "cards": [heading("Security"),
        me("Security", "Armed · home", "mdi:shield-check", "green", "input_boolean.aetos_security", True),
        me("Front door status", "Clear", "mdi:door", "blue", "sensor.front_door_status"),
        me("Media", "Paused", "mdi:speaker", "orange")]},
    {"type": "grid", "cards": [heading("Weather"),
        {"type": "weather-forecast", "entity": "weather.aetos_weather", "forecast_type": "daily", "show_current": True, "grid_options": {"columns": "full"}}]},
    {"type": "grid", "cards": [heading("Calendar"),
        {"type": "calendar", "entities": ["calendar.aetos_calendar"], "initial_view": "listWeek", "grid_options": {"columns": "full"}}]},
    {"type": "grid", "cards": [heading("Energy"), energy]},
  ]
}]}

for key in ("lovelace.aetos", "lovelace.aetos-home"):
    json.dump({"version": 1, "minor_version": 1, "key": key, "data": {"config": cfg}}, open(os.path.join(S, key), "w"), indent=2)
    print("wrote", key)
print("done")
