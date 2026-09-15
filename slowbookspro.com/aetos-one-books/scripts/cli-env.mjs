import Module from 'node:module'
const orig = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return orig.call(this, request, parent, isMain)
}
