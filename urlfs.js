const urlfs = {
  _a: document.createElement("a"),
  _pathSplit: ["/", "?", "&", "#"],
  _eventListeners: {},
  _listener: null,
  _textCache: {},
  _jsonCache: {},
  storage: localStorage,
  stackd: [],
  pwd: "",

  _checkForChanges() {
    for (let path in this._eventListeners) {
      let parents = this._parentListeners(path)
      if (this._pathSplit.includes(path.slice(-1))) {
        let files = this.ls(path)
        for (let listener of this._eventListeners[path]) {
          if (files.length) {
            for (let file of files) this.addListenerToPath(path + file, listener)
          } else if (parents.includes(listener) && this.storage.getItem(path) == null) {
            this.removeListenerFromPath(path, listener)
          }
        }
      } else if (this._textCache[path] != this.storage.getItem(path)) {
        this._textCache[path] = this.storage.getItem(path)
        for (let listener of this._eventListeners[path]) {
          listener(path, this._textCache[path])
        }
      } else if (this.storage.getItem(path) == null) {
        for (let listener of this._eventListeners[path]) {
          if (parents.includes(listener)) this.removeListenerFromPath(path, listener)
        }
      }
    }
  },
  _parentListeners(childPath) {
    let listeners = []
    for (let path in this._eventListeners) {
      if (path == childPath) continue
      if (this._pathSplit.includes(path.slice(-1)) && childPath.slice(0, path.length) == path) {
        for (let listener of this._eventListeners[path]) if (!listeners.includes(listener)) listeners.push(listener)
      }
    }
    return listeners
  },

  absUrl(path = this.pwd) {
    let pwd = this.pwd
    if (path.includes(":/")) pwd = ""
    if (path.slice(0, 1) == "/") pwd = ""
    if (path.includes("?")) pwd = pwd.slice(0, (pwd + "?").indexOf("?"))
    if (path.includes("#")) pwd = pwd.slice(0, (pwd + "#").indexOf("#"))
    if (!this._pathSplit.includes(path.slice(0, 1))) pwd = pwd.slice(0, pwd.lastIndexOf("/") + 1)
    this._a.href = pwd + path
    return this._a.href
  },
  dirname(path) {
    if (this._pathSplit.includes(path.slice(-1))) path = path.slice(0, -1)
    return path.slice(0, -path.split(/[\/\?\&\#]/).pop().length)
  },
  basename(path) {
    let parts = path.split(/[\/\?\&\#]/)
    let name
    while (!name) name = parts.pop()
    return path.slice(parts.lastIndexOf(name))
  },
  cd(path) {
    if (!path) { this.pwd = ""; path = "." }
    this.pwd = this.absUrl(path)
    if (!this._pathSplit.includes(this.pwd.slice(-1))) this.pwd += "/"
    return this.pwd
  },
  pushd(path) {
    this.stackd.push(this.pwd)
    return this.cd(path)
  },
  popd() {
    this._a.href = "."
    return this.pwd = this.stackd.pop() || this._a.href
  },

  ls(path) {
    let files = []
    if (path) this.pushd(path)
    for (let i = 0; i < this.storage.length; i++) {
      let key = this.storage.key(i)
      if (key.slice(0, this.pwd.length) != this.pwd) continue
      key = key.slice(this.pwd.length)
      for (let sep of this._pathSplit) key = key.slice(0, (key + sep).indexOf(sep) + 1)
      if (!files.includes(key)) files.push(key)
    }
    if (path) this.popd()
    return files.sort()
  },

  delete(path) {
    path = this.absUrl(path)
    let items = [path]
    if (this._pathSplit.includes(path.slice(-1))) {
      for (let i = 0; i < this.storage.length; i++) {
        let key = this.storage.key(i)
        if (key.slice(0, path.length) != path) continue
        if (!items.includes(key)) items.push(key)
      }
    }
    items.sort().reverse()
    for (let item of items) {
      this._jsonCache[item] = null
      this.storage.removeItem(item)
    }
  },
  copy(path, dest) {
    path = this.absUrl(path)
    dest = this.absUrl(dest)
    let items = []
    if (this._pathSplit.includes(path.slice(-1))) {
      if (!this._pathSplit.includes(dest.slice(-1))) dest += "/"
      dest += this.basename(path)
      for (let i = 0; i < this.storage.length; i++) {
        let key = this.storage.key(i)
        if (key.slice(0, path.length) != path) continue
        if (!items.includes(key)) items.push(key)
      }
    } else {
      if (this._pathSplit.includes(dest.slice(-1))) dest += this.basename(path)
      items.push(path)
    }
    items.sort()
    for (let item of items) {
      let d = item.replace(path, dest)
      this.storage.setItem(d, this.storage.getItem(item))
    }
  },

  readText(path) {
    path = this.absUrl(path)
    try {
      if (!(this._textCache[path] || this.storage.getItem(path))) fetch(path).then(resp => resp.ok ? resp.text() : null).then(data => {
        if (!this.storage.getItem(path)) {
          if (data) this.storage.setItem(path, data)
          this._textCache[path] = !data
        }
      })
    } catch (error) { }
    return this.storage.getItem(path)
  },
  writeText(path, data) {
    this._jsonCache[this.absUrl(path)] = null
    this.storage.setItem(this.absUrl(path), data)
  },
  addListenerToPath(path, listener) {
    path = this.absUrl(path)
    this._eventListeners[path] = this._eventListeners[path] || []
    if (!this._eventListeners[path].includes(listener)) this._eventListeners[path].push(listener)
    if (!this._listener) this._listener = setInterval(this._checkForChanges.bind(this), 128)
  },
  removeListenerFromPath(path, listener) {
    path = this.absUrl(path)
    let items = [path]
    if (this._pathSplit.includes(path.slice(-1))) {
      for (let key in this._eventListeners) {
        if (key.slice(0, path.length) != path) continue
        if (!items.includes(key)) items.push(key)
      }
    }
    items.sort()
    for (let item of items) {
      if (!this._eventListeners[item]) continue
      if (this._eventListeners[item].includes(listener)) this._eventListeners[item].splice(this._eventListeners[item].indexOf(listener), 1)
      if (!this._eventListeners[item].length) this._eventListeners[item] = null
    }
  },

  readJson(path) {
    try {
      return JSON.parse(this.readText(path))
    } catch (error) {
      return this.readText(path)
    }
  },
  writeJson(path, data) {
    try {
      this.writeText(path, JSON.stringify(data))
    } catch (error) {
      this.writeText(path, data)
    }
  },
  editJson(path, timeout = 0) {
    path = this.absUrl(path)
    if (this._jsonCache[path]) return this._jsonCache[path]
    this._jsonCache[path] = this.readJson(path)
    let text = JSON.stringify(this._jsonCache[path])
    setTimeout(() => {
      if (!this._jsonCache[path]) return
      if (text != JSON.stringify(this._jsonCache[path])) this.writeJson(path, this._jsonCache[path])
      this._jsonCache[path] = null
    }, timeout)
    return this._jsonCache[path]
  },
}
urlfs.popd()
