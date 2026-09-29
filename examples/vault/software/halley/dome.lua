-- The dome controller's night script: when to open, when to close.
-- Limits come from handbook/safety-card.adoc and the wind rule in
-- handbook/operations-handbook.md; the belt history is logs/dome-log.org:9.

local limits = {
  wind_kmh = 40,
  humidity = 85,
}

local banner = [[
Dome controller
Never open above 40 km/h wind.
]]

local function safe(weather)
  return weather.wind_kmh < limits.wind_kmh and weather.humidity < limits.humidity
end

local dome = {}

function dome.open(weather)
  if not safe(weather) then
    return false, "unsafe: " .. weather.wind_kmh .. " km/h"
  end
  return true
end

function dome.close(reason)
  print("closing: " .. (reason or "end of night"))
end

--[[ A manual override exists on the panel by the door;
     see https://halden-ridge.invalid/dome/override before using it. ]]
print(banner)
return dome
