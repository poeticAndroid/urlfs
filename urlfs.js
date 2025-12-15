const urlfs = {
  _a: document.createElement("a"),
  _pathSplit: ["/", "?", "&", "=", "#"],
  _eventListeners: {},
  _listener: null,
  _failedFetch: {},
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
      if (key && !files.includes(key)) files.push(key)
    }
    if (path) this.popd()
    return files.sort()
  },

  rm(path) {
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
  cp(path, dest) {
    path = this.absUrl(path)
    dest = this.absUrl(dest)
    let items = []
    if (this._pathSplit.includes(path.slice(-1))) {
      if (!this._pathSplit.includes(dest.slice(-1))) dest += path.slice(-1)
      // dest += this.basename(path)
      for (let i = 0; i < this.storage.length; i++) {
        let key = this.storage.key(i)
        if (key.slice(0, path.length) != path) continue
        if (!items.includes(key)) items.push(key)
      }
    } else {
      while (this._pathSplit.includes(dest.slice(-1))) dest = dest.slice(0, -1)
      items.push(path)
    }
    items.sort()
    for (let item of items) {
      let d = item.replace(path, dest)
      this.storage.setItem(d, this.storage.getItem(item))
    }
  },

  async preload(...paths) {
    let n = 0
    for (let path of paths) if (this.readText(path)) n++
    if (n == paths.length) return true
    return new Promise((resolve, reject) => {
      let to = setInterval(e => {
        n = 0
        for (let path of paths) {
          if (this.readText(path)) n++
          else if (this._failedFetch[path]) {
            clearInterval(to)
            reject("fetch error")
          }
        }
        if (n == paths.length) {
          clearInterval(to)
          resolve(true)
        }
      }, 256)
    })
  },
  async updateDefaults(...paths) {
    let len = paths.length
    for (let i = 0; i < len; i++) {
      let file = paths[i]
      this.rm(file + "?new")
      paths.push(file + "?new")
    }
    await this.preload(...paths)
    for (let i = 0; i < len; i++) {
      let file = paths[i]
      let user = this.readJson(file)
      let oldDef = this.readJson(file + "?default") || {}
      let newDef = this.readJson(file + "?new")
      for (let key in user) {
        if (JSON.stringify(user[key]) === JSON.stringify(oldDef[key])) user[key] = newDef[key]
      }
      for (let key in newDef) {
        if (JSON.stringify(user[key]) === JSON.stringify(oldDef[key])) user[key] = newDef[key]
      }
      this.writeJson(file, user)
      this.writeText(file + "?default", this.readText(file + "?new"))
      this.rm(file + "?new")
    }
  },

  readText(path) {
    path = this.absUrl(path)
    try {
      if (!(this._failedFetch[path] || this.storage.getItem(path))) fetch(path).then(resp => resp.ok ? resp.text() : null).then(data => {
        this._failedFetch[path] = !data
        if (data && !this.storage.getItem(path)) this.storage.setItem(path, data)
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
      if (!this._eventListeners[item].length) delete this._eventListeners[item]
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





  delete(path) {
    let now = new Date()
    if (now.getFullYear() > 2026) {
      throw new Error("urlfs.delete method obsolete! Use rm instead!")
    } else {
      console.warn("urlfs.delete method obsolete! Use rm instead!")
      return this.rm(path)
    }
  },
  copy(path, dest) {
    let now = new Date()
    if (now.getFullYear() > 2026) {
      throw new Error("urlfs.copy method obsolete! Use cp instead!")
    } else {
      console.warn("urlfs.copy method obsolete! Use cp instead!")
      if (this._pathSplit.includes(path.slice(-1))) {
        if (!this._pathSplit.includes(dest.slice(-1))) dest += "/"
        console.warn(`...and dest must be '${dest + this.basename(path)}' instead of '${dest}'`)
        dest += this.basename(path)
      } else {
        if (this._pathSplit.includes(dest.slice(-1))) {
          console.warn(`...and dest must be '${dest + this.basename(path)}' instead of '${dest}'`)
          dest += this.basename(path)
        }
      }
      return this.cp(path, dest)
    }
  },
}
urlfs.popd()
