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
 * Creates a new division
 *
 * @class Represents a division, or breath mark
 * @param {String} key Type of division
 * @see Toe.Model.Division.Type
 */
Toe.Model.Division = function(key, options) {
    // check valid type
    this.key = key.toLowerCase();
    this.type = Toe.Model.Division.Type[this.key];
    if (this.type == undefined) {
        throw new Error("Division: undefined division type");
    }

    this.props = {
        interact: true
    };

    $.extend(this.props, options);

    // initialize bounding box
    this.zone = new Object();

    // set by server or MEI so null by default
    this.id = null;

    // reference to the system this clef is mounted on
    this.system = null;
};

Toe.Model.Division.prototype = new Toe.Model.Model();
Toe.Model.Division.prototype.constructor = Toe.Model.Division;

/**
 * Sets the shape of the Division
 *
 * @methodOf Toe.Model.division
 * @param {String} shape the new division shape
 */
Toe.Model.Division.prototype.setShape = function(shape) {
    this.shape = shape.toLowerCase();
    this.name = Toe.Model.Division.Type[this.shape];
    this.type = Toe.Model.Division.Type[this.shape];
    this.key = this.shape;

    if (this.name == undefined) {
        throw new Error("Division: unknown division shape");
    }

    $(this).trigger("vUpdateShape", [this]);
}

/**
 * Sets the bounding box of the division
 *
 * @methodOf Toe.Model.Division
 * @param {Array} bb [ulx, uly, lrx, lry]
 */
Toe.Model.Division.prototype.setBoundingBox = function(bb) {
    if(!Toe.validBoundingBox(bb)) {
        throw new Error("Division: invalid bounding box");
    }

    bb = $.map(bb, Math.round);

    this.zone.ulx = bb[0];
    this.zone.uly = bb[1];
    this.zone.lrx = bb[2];
    this.zone.lry = bb[3];
}

/**
 * Sets the id of the division element.
 * 
 * @methodOf Toe.Model.Division
 * @param {String} id
 */
Toe.Model.Division.prototype.setID = function(did) {
    this.id = did;
}

Toe.Model.Division.prototype.setSystem = function(aSystem) {
    if (!(aSystem instanceof Toe.Model.System)) {
        throw new Error("Toe.Model.Division: invalid system reference");
    }

    this.system = aSystem;
}

/**
 * Known division types
 *
 * @constant
 * @public
 * @fieldOf Toe.Model.Division
 */
Toe.Model.Division.Type = {
    div_small: "Small Division",
    div_minor: "Minor Division",
    div_major: "Major Division",
    div_final: "Final Division"
};

/**
 * Select division on the drawing surface
 */
Toe.Model.Division.prototype.selectDrawing = function() {
    $(this).trigger("vSelectDrawing");
}
