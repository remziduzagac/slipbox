-- Sam's Neovim helpers for the Kestrel repo.
-- Setup notes: ../../docs/dev-setup.md
local M = {}

local root = vim.fs.root(0, { ".git" }) or vim.loop.cwd()

local function relpath(p)
  return (p:gsub("^" .. vim.pesc(root) .. "/", ""))
end

function M.init(opts)
  M.opts = vim.tbl_extend("force", { leader = "<space>k" }, opts or {})
  vim.keymap.set("n", M.opts.leader .. "t", M.toggle_test, { desc = "toggle test file" })
end

M.toggle_test = function()
  local name = relpath(vim.api.nvim_buf_get_name(0))
  vim.cmd.edit((name:gsub("%.ts$", ".test.ts")))
end

local Route = {}
Route.__index = Route

function Route.new(name)
  return setmetatable({ name = name }, Route)
end

function Route:describe()
  local function pad(s) return s .. " " end
  return pad(self.name)
end

function Route:distance(km)
  vim.schedule(function()
    print(self.name, km)
  end)
end

M.labels = {
  ["café"] = "Café Radfahrer",
  kyoto = "京都の坂道",
  arrow = "→ 𝄞 emoji 🚲",
}

local HELP = [[
<space>kt  toggle the test file
-- lines starting with -- are kept as-is
]]

--[==[
Route:distance is async because vim.schedule defers the print;
callers must not rely on the output being there when it returns.
]==]

return M
