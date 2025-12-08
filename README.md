URL Filesystem
==============
Use the webserver as a faux filesystem using localStorage

API
---
```js
const urlfs = {
  storage: localStorage // storage object to use
  stackd: [] // directory stack used by `pushd` and `popd`
  pwd: "./" // current working directory

  absUrl(path = this.pwd) // resolve `path` relative to `pwd`
  dirname(path) // directory name of `path`
  basename(path) // base filename of `path`
  cd(path) // change current directory
  pushd(path) // push `pwd` to `stackd` and change current directory to `path`
  popd() // pop path from `stackd` and change current directory to it

  ls(path) // return array of entries in `path`

  rm(path) // delete file or entire directory
  copy(path, dest) // copy `path` to `dest`

  async preload(...paths) // ensure all `paths` have content or fetch from webserver

  readText(path) // return file contents as string
  writeText(path, data) // write text to file
  addListenerToPath(path, listener) // register `listener` as a function to be called on every change to `path` or its descendants
  removeListenerFromPath(path, listener) // remove `listener` from `path` 

  readJson(path) // parse file contents as JSON and return its value if valid, otherwise behave as `readText`
  writeJson(path, data) // write stringified data to file
  editJson(path, timeout = 0) // like `readJson`, but returned value will be saved automatically to the same file after timeout.
}
```