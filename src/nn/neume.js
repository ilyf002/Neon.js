/*
Copyright (C) 2011-2013 by Gregory Burlet, Alastair Porter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 * Creates a neume
 * Each neume has: name, list of neume elements, and liquescent modifier.
 * @class Models a neume: a container for one or more notes.
 * @param {Object} options modifier {Toe.Model.Neume.Modifier}, interact {Boolean}
 */
Toe.Model.Neume = function(options) {
    // initialize bounding box
    this.zone = new Object();

    this.props = {
        modifier: null,
        interact: true
    };

    $.extend(this.props, options);

    // check neume modifier is known
    this.props.modifier = Toe.Model.Neume.Modifier[this.props.modifier];
    if (this.props.modifier == undefined) {
        this.props.modifier = null;
    }

    // name of the neume
    this.name = null;
    // type id - from search tree
    this.typeid = null;
    // if compound neume, the name of the neume prefix to draw
    this.neumePrefix = null;

    // neume ID (generated by server (or from MEI), so null by default)
    this.id = null;

    // reference to the system this neume is mounted on
    this.system = null;

    // initialize neume component array
    this.components = new Array();
}

Toe.Model.Neume.prototype.constructor = Toe.Model.Neume;

/**
 * Types of neume variants: 
 * alt: regular liquescence (for square-note notation)
 * aug: augmented liquescence
 * dim: diminished liquescence
 *
 * @constant
 * @public
 * @fieldOf Toe.Model.Neume
 */
Toe.Model.Neume.Modifier = {
    alt: "liquescence",
    aug: "liquescence_aug",
    dim: "liquescence_dim"
}

/**
 * Sets the id of the neume
 *
 * @methodOf Toe.Model.Neume
 * @ param {String} nid neume id
 */
Toe.Model.Neume.prototype.setID = function(nid) {
    this.id = nid;
}

Toe.Model.Neume.prototype.setSystem = function(aSystem) {
    if (!(aSystem instanceof Toe.Model.System)) {
        throw new Error("Toe.Model.Neume: invalid system reference");
    }

    this.system = aSystem;
}

/**
 * Sets the bounding box of the neume
 *
 * @methodOf Toe.Model.Neume
 * @param {Array} bb [ulx, uly, lrx, lry]
 */
Toe.Model.Neume.prototype.setBoundingBox = function(bb) {
    if(!Toe.validBoundingBox(bb)) {
        throw new Error("Neume: invalid bounding box");
    }

    bb = $.map(bb, Math.round);

    // set position
    this.zone.ulx = bb[0];
    this.zone.uly = bb[1];
    this.zone.lrx = bb[2];
    this.zone.lry = bb[3];
}

/**
 * Adds a neume component to the neume
 * nInd is index 0 based
 *
 * @methodOf Toe.Model.Neume
 * @param {string} Neume component type
 * @diff {number} pitch difference from the root
 * @options {Object} options neumeInd {number} index of where to insert the component in the neume
 */
Toe.Model.Neume.prototype.addComponent = function(nc, options) {
    opts = {
        ncInd: this.components.length
    };

    $.extend(opts, options);

    this.components.splice(opts.ncInd, 0, nc);
}

/**
 * Synchronize drawing with the current state of the model.
 * Should be called when underlying note content has changed 
 * or ornamentation has been added to individual notes.
 */
Toe.Model.Neume.prototype.syncDrawing = function() {
    this.deriveName();

    $(this).trigger("vUpdateDrawing", [this]);
}
