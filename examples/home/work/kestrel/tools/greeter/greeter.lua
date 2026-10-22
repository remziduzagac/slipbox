-- The onboarding kata in Lua. Siblings: ./greeter.ts (the index), greeter.go, greeter.js, greeter.py,
-- greeter.rs, greeter.sh, greeter.tsx. A Greeter with greet and shout, and greet_all.
local Greeter = {}
Greeter.__index = Greeter

function Greeter.new(greeting)
  return setmetatable({ greeting = greeting or "Hello" }, Greeter)
end

function Greeter:greet(name)
  return self.greeting .. ", " .. name .. "!"
end

function Greeter:shout(name)
  return self:greet(name):upper()
end

local function greet_all(g, names)
  local out = {}
  for _, n in ipairs(names) do
    out[#out + 1] = g:greet(n)
  end
  return out
end

return { Greeter = Greeter, greet_all = greet_all }
