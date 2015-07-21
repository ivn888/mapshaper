/* @requires mapshaper-common, mapshaper-maplayer, mapshaper-map-nav, mapshaper-map-extent */

// Test if map should be re-framed to show updated layer
gui.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
  var boundsChanged = !prevBounds || !prevBounds.equals(newBounds);
  var intersects = newBounds.intersects(mapBounds);
  // TODO: compare only intersecting portion of layer with map bounds
  var areaRatio = newBounds.area() / mapBounds.area();
  if (areaRatio > 1) areaRatio = 1 / areaRatio;

  if (!boundsChanged) return false; // don't reset if layer extent hasn't changed
  if (!intersects) return true; // reset if layer is out-of-view
  return areaRatio < 0.5; // reset if layer is not at a viewable scale
};

function MshpMap(model) {
  var _root = El("#mshp-main-map"),
      _ext = new MapExtent(_root),
      _nav = new MapNav(_ext, _root),
      _groups = [],
      _highGroup,
      _activeGroup;

  var darkStroke = "#335",
      lightStroke = "rgba(222, 88, 249, 0.23)",
      activeStyle = {
        strokeColor: darkStroke,
        dotColor: "#223"
      },
      highStyle = {
        dotColor: "#F24400"
      };

  _ext.on('change', refreshLayers);

  model.on('delete', function(e) {
    deleteGroup(e.dataset);
  });

  model.on('update', function(e) {
    var prevBounds = _activeGroup ?_activeGroup.getBounds() : null,
        group = findGroup(e.dataset),
        needReset;
    if (!group) {
      group = addGroup(e.dataset);
    } else if (e.flags.simplify || e.flags.proj || e.flags.arc_count) {
      // update filtered arcs when simplification thresholds are calculated
      // or arcs are updated
      if (e.flags.proj && e.dataset.arcs) {
         // reset simplification after projection (thresholds have changed)
         // TODO: reset is not needed if -simplify command is run after -proj
        e.dataset.arcs.setRetainedPct(1);
      }
      group.updated();
    }
    group.showLayer(e.layer);
    updateGroupStyle(activeStyle, group);
    _activeGroup = group;
    needReset = gui.mapNeedsReset(group.getBounds(), prevBounds, _ext.getBounds());
    _ext.setBounds(group.getBounds()); // update map extent to match bounds of active group
    if (needReset) {
      // zoom to full view of the active layer and redraw
      _ext.reset(true);
    } else {
      // refresh without navigating
      refreshLayers();
    }
  });

  this.setHighlightLayer = function(lyr, dataset) {
    if (_highGroup) {
      deleteGroup(_highGroup.getDataset());
      _highGroup = null;
    }
    if (lyr) {
      _highGroup = addGroup(dataset);
      _highGroup.showLayer(lyr);
      updateGroupStyle(highStyle, _highGroup);
      refreshLayer(_highGroup);
    }
  };

  this.setSimplifyPct = function(pct) {
    _activeGroup.setRetainedPct(pct);
    refreshLayer(_activeGroup);
  };

  this.refreshLayer = function(dataset) {
    refreshLayer(findGroup(dataset));
  };

  this.getElement = function() {
    return _root;
  };

  this.getExtent = function() {
    return _ext;
  };

  this.refresh = function() {
    refreshLayers();
  };

  function updateGroupStyle(style, group) {
    var lyr = group.getLayer(),
        dataset = group.getDataset();
    style.dotSize = calcDotSize(MapShaper.countPointsInLayer(lyr));
    style.strokeColor = getStrokeStyle(lyr, dataset.arcs);
  }

  function getStrokeStyle(lyr, arcs) {
    var stroke = lightStroke,
        counts;
    if (MapShaper.layerHasPaths(lyr)) {
      counts = new Uint8Array(arcs.size());
      MapShaper.countArcsInShapes(lyr.shapes, counts);
      stroke = function(i) {
        return counts[i] > 0 ? darkStroke : lightStroke;
      };
    }
    return stroke;
  }

  function calcDotSize(n) {
    return n < 20 && 5 || n < 500 && 4 || 3;
  }

  function refreshLayers() {
    _groups.forEach(refreshLayer);
  }

  function refreshLayer(group) {
    var style;
    if (group == _activeGroup) {
      style = activeStyle;
    } else if (group == _highGroup) {
      style = highStyle;
    }
    if (style) {
      group.draw(style, _ext);
    } else {
      group.hide();
    }
  }

  function addGroup(dataset) {
    var group = new LayerGroup(dataset);
    group.getElement().appendTo(_root);
    _groups.push(group);
    return group;
  }

  function deleteGroup(dataset) {
    _groups = _groups.reduce(function(memo, g) {
      if (g.getDataset() == dataset) {
        g.remove();
      } else {
        memo.push(g);
      }
      return memo;
    }, []);
  }

  function findGroup(dataset) {
    return utils.find(_groups, function(group) {
      return group.getDataset() == dataset;
    });
  }
}

utils.inherit(MshpMap, EventDispatcher);
