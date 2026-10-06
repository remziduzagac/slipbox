-- A plugin mid-edit: the function below is missing its `end`.
local M = {}

local ns = vim.api.nvim_create_namespace("kestrel")

function M.setup(opts)
  opts = opts or {}
  if opts.verbose then
    print(kestrel_debug)
  end

function M.teardown()
  return nil
end

return M
