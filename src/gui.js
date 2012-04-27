/*
Copyright (C) 2011 by Gregory Burlet, Alastair Porter

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
 * Manages the GUI creation and interactions
 *
 * @class GUI handling
 * @param {Object} guiToggles Boolean values toggling instantiation of GUI elements
 */
Toe.View.GUI = function(prefix, fileName, rendEng, page, guiToggles) {
    var toggles = {
        sldr_bgImgOpacity: true,
        initBgImgOpacity: 0.60,
        btn_neumify: true,
        btn_delete: true,
        btn_explode: true,
        radio_mode: true,
        initMode: "edit"
    };

    $.extend(toggles, guiToggles);

    this.rendEng = rendEng;
    this.page = page;

    // set up punctum that follows the pointer in insert mode
    this.punctGlyph = this.rendEng.getGlyph("punctum");
    this.punct = this.punctGlyph.clone();

    var parentDivId = "#gui-sidebar";

    // create background image opacity slider
    if (toggles.sldr_bgImgOpacity) {
        $(parentDivId).prepend('<span id="sidebar-bg"><li class="nav-header">Background</li>\n<li>\n<label for="sldr_bgImgOpacity"><b>Image Opacity</b>:</label>\n<input id="sldr_bgImgOpacity" type="range" name="bgImgOpacity" min="0.0" max="1.0" step="0.05" value="' + toggles.initBgImgOpacity + '" />\n</li></span>');

        $("#sldr_bgImgOpacity").bind("change", function() {
            rendEng.canvas.backgroundImageOpacity = $(this).val();
            rendEng.repaint();
        });
    }

    // cache references which are overridden inside functions
    punctGlyph = this.punctGlyph;
    punct = this.punct;

    $("#btn_edit").bind("click", function() {
        // first remove insert options
        $(parentDivId + "> #sidebar-insert").remove();

        // unbind insert event handlers
        delete rendEng.canvas.__eventListeners["mouse:move"];
        delete rendEng.canvas.__eventListeners["mouse:up"];
        rendEng.canvas.remove(punct);
        rendEng.repaint();
               
        if ($(parentDivId + "> #sidebar-edit").length == 0) {
            $(parentDivId).append('<span id="sidebar-edit"><br /><li class="nav-header">Edit</li>\n<li>\n<button id="btn_delete" class="btn"><i class="icon-remove"></i> Delete</button>\n</li>\n<li>\n<div class="btn-group">\n<button id="btn_neumify" class="btn"><i class="icon-magnet"></i> Neumify</button><button id="btn_ungroup" class="btn"><i class="icon-share"></i> Ungroup</button></div></li></span>');
        }
        
        gui = this;
        rendEng.canvas.observe('mouse:down', function(e) {
            // cache pointer coordinates for mouse up
            gui.downCoords = rendEng.canvas.getPointer(e.memo.e);
        });

        rendEng.canvas.observe('mouse:up', function(e) {
            var upCoords = rendEng.canvas.getPointer(e.memo.e);
            var sModel = page.getClosestStaff(upCoords);

            // if something is selected we need to do some housekeeping
            var selection = rendEng.canvas.getActiveObject();
            if (selection) {
                var ele = selection.eleRef;

                // get delta of the mouse movement
                var delta_x = gui.downCoords.x - upCoords.x;
                var delta_y = gui.downCoords.y - upCoords.y;

                // a single neume has been dragged
                if (ele instanceof Toe.Model.Neume) {
                    // we have a neume, this is a pitch shift
                    console.log("dragging neume");

                    // get y position of first neume component
                    var nc_y = selection.staffRef.clef.y - (ele.rootDiff * selection.staffRef.delta_y/2);
                    //var finalCoords = {x: selection.left - delta_x, y: nc_y - delta_y};
                    var finalCoords = {x: selection.left, y: nc_y - delta_y};
                    
                    // snap to staff
                    var snapInfo = sModel.ohSnap(finalCoords, selection.currentWidth, {ignoreID: ele.id});
                    var snapCoords = snapInfo["snapCoords"];
                    var pElementID = snapInfo["pElementID"];

                    var ncdelta_y = nc_y - snapCoords.y;

                    // change certain attributes of the element
                    // [ulx, uly, lrx, lry]
                    var ulx = snapCoords.x-(selection.currentWidth/2);
                    var uly = selection.top-(selection.currentHeight/2)-(finalCoords.y-snapCoords.y);
                    var bb = [ulx, uly, ulx + selection.currentWidth, uly + selection.currentHeight];
                    ele.setBoundingBox(bb);
                    //rendEng.outlineBoundingBox(bb, {fill: "blue"});

                    // derive pitch name and octave of notes in the neume on the appropriate staff
                    for (var i = 0; i < ele.components.length; i++) {
                        var noteInfo = sModel.calcNoteInfo({x: snapCoords.x, y: snapCoords.y - (sModel.delta_y/2 * ele.components[i].pitchDiff)});
                        //console.log("new pname: " + noteInfo["pname"] + ", oct: " + noteInfo["oct"]);
                        ele.components[i].setPitchInfo(noteInfo["pname"], noteInfo["oct"]);
                    }

                    // remove the old neume
                    selection.staffRef.removeElementByRef(ele);
                    rendEng.canvas.remove(selection);
                    
                    // mount the new neume on the most appropriate staff
                    sModel.addNeume(ele);
                    console.log(ele);

                    rendEng.repaint();
                }
                else if (ele instanceof Toe.Model.Custos) {

                }
                else if (ele instanceof Toe.Model.Clef) {
                    // this is a clef
                }
                else {
                    // this is a division
                }
            }
            else {
                selection = rendEng.canvas.getActiveGroup();
                if (selection) {
                    // a group of elements have been dragged
                    console.log("dragging elementS");
                }
            }
        });

        // handler for delete
        $("#btn_delete").bind("click.edit", function() {
            // get current canvas selection
            // check individual selection and group selections
            nids = new Array();
            var selection = rendEng.canvas.getActiveObject();
            if (selection) {
                // individual element selected
                nids.push(selection.eleRef.id);
                rendEng.canvas.remove(selection);

                // remove element from internal representation
                selection.staffRef.removeElementByRef(selection.eleRef);

                rendEng.canvas.discardActiveObject();
                rendEng.repaint();
            }
            else {
                selection = rendEng.canvas.getActiveGroup();
                if (selection) {
                    // group of neumes selected
                    for (var i = selection.objects.length-1; i >= 0; i--) {
                        nids.push(selection.objects[i].neumeRef.id);
                        rendEng.canvas.remove(selection.objects[i]);

                        // remove element from internal representation
                        selection.staffRef.removeElementByRef(selection.eleRef);
                    }
                    rendEng.canvas.discardActiveGroup();
                    rendEng.repaint();
                }
            }

            // send delete command to server to change underlying MEI
            $.post(prefix + "/edit/" + fileName + "/delete/note",  {id: nids.join(",")})
            .error(function() {
                // show alert to user
                // replace text with error message
                $(".alert > p").text("Server failed to delete note. Client and server are not syncronized.");
                $(".alert").toggleClass("fade");
            });
        });

    });

    $("#btn_insert").bind("click.insert", function() {
        // first remove edit options
        $(parentDivId + "> #sidebar-edit").remove();

        // unbind edit event handlers
        $("#btn_delete").unbind("click.edit");

        // unbind move event handlers
        delete rendEng.canvas.__eventListeners["mouse:down"];
        delete rendEng.canvas.__eventListeners["mouse:up"];

        // then add insert options
        if ($(parentDivId + "> #sidebar-insert").length == 0) {
            $(parentDivId).append('<span id="sidebar-insert"><br /><li class="nav-header">Insert</li>\n<li>\n<b>Ornamentation</b>:<div class="btn-group" data-toggle="buttons-checkbox">\n<button id="btn_delete" class="btn">Dot</button>\n<button id="btn_horizepisema" class="btn"><i class="icon-resize-horizontal"></i> Episema</button>\n<button id="btn_vertepisema" class="btn"><i class="icon-resize-vertical"></i> Episema</button>\n</div>\n</span>');
        }

        // put the punctum off the screen for now
        punct.set({left: -50, top: -50, opacity: 0.60});
        rendEng.draw({static: [], modify: [punct]}, {repaint: true, selectable: false});

        // render transparent punctum at pointer location
        rendEng.canvas.observe('mouse:move', function(e) {
            var pnt = rendEng.canvas.getPointer(e.memo.e);
            punct.set({left: pnt.x - punctGlyph.centre[0]/2, top: pnt.y - punctGlyph.centre[1]/2});
            rendEng.repaint();
        });

        rendEng.canvas.observe('mouse:up', function(e) {
            var coords = {x: punct.left, y: punct.top};
            var sModel = page.getClosestStaff(coords);

            // instantiate a punctum
            var nModel = new Toe.Model.Neume();

            // calculate snapped coords
            var snapInfo = sModel.ohSnap(coords, punct.currentWidth);
            var snapCoords = snapInfo["snapCoords"];
            var pElementID = snapInfo["pElementID"];

            // update bounding box with physical position on the page
            var ulx = snapCoords.x - punct.currentWidth/2;
            var uly = snapCoords.y - punct.currentHeight/2;
            var bb = [Math.round(ulx), Math.round(uly), Math.round(ulx + punct.currentWidth), Math.round(uly + punct.currentHeight)];
            nModel.setBoundingBox(bb);

            // get pitch name and octave of snapped coords of note
            var noteInfo = sModel.calcNoteInfo(snapCoords);
            var pname = noteInfo["pname"];
            var oct = noteInfo["oct"];

            // TODO: check ornamentation toggles to add to component
            nModel.addComponent("punctum", pname, oct);

            // instantiate neume view and controller
            var nView = new Toe.View.NeumeView(rendEng);
            var nCtrl = new Toe.Ctrl.NeumeController(nModel, nView);
            
            // mount neume on the staff
            sModel.addNeume(nModel);
            
            /*
            // send insert command to server to change underlying MEI
            $.post(prefix + "/edit/" + fileName + "/new/note", {})
            .error(function() {
                // show alert to user
                // replace text with error message
                $(".alert > p").text("Server failed to insert note. Client and server are not syncronized.");
                $(".alert").toggleClass("fade");
            });*/
        });
    });


    // set active button on startup
    $("#btn_" + toggles.initMode).trigger('click');
}

Toe.View.GUI.prototype.constructor = Toe.View.GUI;
