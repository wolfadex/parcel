const FSWatcher = require('@atom/watcher');
const Path = require('path');
const {EventEmitter} = require('events');

/**
 * This watcher wraps chokidar so that we watch directories rather than individual files on macOS.
 * This prevents us from hitting EMFILE errors when running out of file descriptors.
 * Chokidar does not have support for watching directories on non-macOS platforms, so we disable
 * this behavior in order to prevent watching more individual files than necessary (e.g. node_modules).
 */
class Watcher extends EventEmitter {
  constructor() {
    super();

    this.watchedDirectories = new Map();
    this.stopped = false;
  }

  /**
   * Find a parent directory of `path` which is already watched
   */
  getWatchedParent(path) {
    path = Path.dirname(path);

    let root = Path.parse(path).root;
    while (path !== root) {
      if (this.watchedDirectories.has(path)) {
        return path;
      }

      path = Path.dirname(path);
    }

    return null;
  }

  /**
   * Find a list of child directories of `path` which are already watched
   */
  getWatchedChildren(path) {
    path = Path.dirname(path) + Path.sep;

    let res = [];
    for (let dir of this.watchedDirectories.keys()) {
      if (dir.startsWith(path)) {
        res.push(dir);
      }
    }

    return res;
  }

  /**
   * Add a path to the watcher
   */
  async watch(path) {
    // If there is no parent directory already watching this path, add a new watcher.
    let parent = this.getWatchedParent(path);
    if (!parent) {
      // Find watchers on child directories, and remove them. They will be handled by the new parent watcher.
      let children = this.getWatchedChildren(path);

      for (let dir of children) {
        this._unwatch(dir);
      }

      let dir = Path.dirname(path);
      const watcher = await FSWatcher.watchPath(
        dir,
        {
          recursive: true
        },
        events => {
          console.log(events);
        }
      );

      this.watchedDirectories.set(dir, watcher);
    }
  }

  /**
   * Unwatch a directory
   */
  _unwatch(dir) {
    let watcher = this.watchedDirectories.get(dir);
    if (watcher) {
      this.watchedDirectories.delete(dir);
      return watcher.dispose();
    }
  }

  /**
   * Remove a path from the watcher
   */
  unwatch(path) {
    let dir = this.getWatchedParent(path);
    if (dir) {
      // When the count of files watching a directory reaches zero, unwatch it.
      let count = this.watchedDirectories.get(dir) - 1;
      if (count === 0) {
        this.watchedDirectories.delete(dir);
        this.watcher.unwatch(dir);
      } else {
        this.watchedDirectories.set(dir, count);
      }
    }
  }

  /**
   * Stop watching all paths
   */
  stop() {
    this.stopped = true;
    this.watcher.close();
  }
}

module.exports = Watcher;
