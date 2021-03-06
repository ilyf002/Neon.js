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

Toe.View.SquareNoteInteraction = function(rendEng, scaling, page, apiprefix, guiToggles) {
    Toe.View.Interaction.call(this, rendEng, page, apiprefix, guiToggles);
    var toggles = {
        initMode: "edit"
    };

    $.extend(toggles, guiToggles);

    this.scaling = scaling;
    // these are variables holding pointers to the drawings
    // that follow around the pointer in insert mode.
    this.punctDwg = null;
    this.divisionDwg = null;
    this.clefDwg = null;
    this.systemDwg = null;

    // cache height and width of punctum glyph for use in
    // bounding box estimation in neumify and ungroup
    // and insert ornamentation spacing.
    var punctGlyph = rendEng.getGlyph("punctum").clone();
    this.globalScale = rendEng.getGlobalScale();
    this.pageScale = page.scale;
    this.punctWidth = punctGlyph.width*this.globalScale;
    this.punctHeight = punctGlyph.height*this.globalScale;
    
    //Setting it to either true or false
    this.lowScale = scaling[6];


    this.objMoving = false;

    var parentDivId = "#gui-sidebar";
    // switch to edit mode
    $("#btn_edit").bind("click.edit", {gui: this, parentDivId: parentDivId}, this.handleEdit);

    // switch to insert mode
    $("#btn_insert").bind("click.insert", {gui: this, parentDivId: parentDivId}, this.handleInsert);

    // set active button on startup
    $("#btn_" + toggles.initMode).trigger('click');

    // bind hotkeys
    this.bindHotKeys();

    // binding alerts
    this.bindAlerts();

    //empty old undo files
    window.onload = $.proxy(function() {this.handleDeleteUndos(this);}, this);
};

Toe.View.SquareNoteInteraction.prototype = new Toe.View.Interaction();
Toe.View.SquareNoteInteraction.prototype.constructor = Toe.View.SquareNoteInteraction;

/**************************************************
 *                  EDIT                          *
 **************************************************/
Toe.View.SquareNoteInteraction.prototype.handleEdit = function(e) {
    
    var gui = e.data.gui;
    gui.hideInfo();
    gui.activateCanvasObjects();
    gui.removeInsertControls();
    gui.removeInsertSubControls();
    gui.unbindEventHandlers();
    gui.insertEditControls(e.data.parentDivId);
    gui.removeEditSubControls();

    // Listen for object events.
    gui.rendEng.canvas.observe('object:modified', function(aObject) {
        if(!(aObject.target.eleRef)) {
            gui.handleEventObjectModified(gui, aObject);
        }
    });
    gui.rendEng.canvas.observe('object:moving', function(e) {gui.objMoving = true;});
    gui.rendEng.canvas.observe('object:selected', function(aObject) {
        var e = aObject.e;
        if(e && e.shiftKey){
            gui.rendEng.canvas.deactivateAll();
            gui.showAlert("Cannot use shift-click for more than two neumes. Drag select instead.");
        }
        else{
            gui.handleEventObjectSelected(aObject);
        }
    });

    // Listen for selection events.
    gui.rendEng.canvas.observe('selection:cleared', function(aObject) { gui.handleEventSelectionCleared(aObject);});
    gui.rendEng.canvas.observe('selection:created', function(aObject) {
        var e = aObject.e;
        if(e && e.shiftKey){
            gui.rendEng.canvas.deactivateAll();
            gui.showAlert("Cannot use shift-click for more than two neumes. Drag select instead.");
        }
        else{
            gui.handleEventSelectionCreated(aObject);
        }
    });

    // Listen for mouse events.
    gui.rendEng.canvas.observe('mouse:down', function(e) {gui.downCoords = gui.rendEng.canvas.getPointer(e.e);});
    gui.rendEng.canvas.observe('mouse:up', function(e) {
        var upCoords = gui.rendEng.canvas.getPointer(e.e);

        // get delta of the mouse movement
        var delta_x = gui.downCoords.x - upCoords.x;
        var delta_y = gui.downCoords.y - upCoords.y;
        gui.handleObjectsMoved(delta_x, delta_y, gui)
    });

    // Bind click handlers for the side-bar buttons

    // Unbinding first to avoid stacking
    $("#btn_delete").unbind("click");
    $("#btn_duplicate").unbind("click");
    $("#group_shape").unbind("change");
    $("#btn_ungroup").unbind("click");
    $("#btn_mergesystems").unbind("click");
    $("#btn_stafflock").unbind("click");
    $("#btn_selectall").unbind("click");
    $("#btn_refresh").unbind("click");
    $("#btn_undo").unbind("click");
    $("#btn_quickgroup").unbind("click");
    $("#btn_zoom").unbind("click");

    // Linking the buttons to their respective functions
    $("#btn_undo").bind("click.edit", {gui: gui}, gui.handleUndo);
    $("#btn_refresh").bind("click.edit", {gui: gui}, gui.handleRefresh);
    $("#btn_delete").bind("click.edit", {gui: gui}, gui.handleDelete);
    $("#btn_duplicate").bind("click.edit", {gui: gui}, gui.handleDuplicate);
    $("#btn_quickgroup").bind("click.edit", {gui: gui, modifier: ""}, gui.handleQuickNeumify);
    $("#group_shape").bind("change", {gui: gui, modifier: ""}, gui.handleNeumify);
    $("#btn_ungroup").bind("click.edit", {gui: gui}, gui.handleUngroup);
    $("#btn_mergesystems").bind("click.edit", {gui: gui}, gui.handleMergeSystems);
    $("#btn_stafflock").bind("click.edit", {gui: gui}, gui.handleStaffLock);
    $("#btn_selectall").bind("click.edit", {gui: gui}, gui.handleSelectAll);
    $("#btn_zoom").bind("click.edit", {gui: gui}, gui.handleZoom);

};

Toe.View.SquareNoteInteraction.prototype.handleHorizEpisemaToggle = function(e) {
    var gui = e.data.gui;
    var punctum = e.data.punctum;

    var hasEpisema = punctum.components[0].hasOrnament("episema");
    var episemaForm = "horizontal";

    if(hasEpisema){
        episemaForm = punctum.components[0].getOrnamentForm("episema");
    }

    if(episemaForm == "vertical"){
        gui.showAlert("Cannot have both horizontal and vertical episemas");
    }
    else {
        if (!hasEpisema) {
            // add a horizontal episema
            var ornament = new Toe.Model.Ornament("episema", {form: "horizontal"});
            punctum.components[0].addOrnament(ornament);
        }
        else {
            // remove horizontal episema
            punctum.components[0].removeOrnament("episema");
        }

        // update neume drawing
        punctum.syncDrawing();

        // get final bounding box information
        if (gui.lowScale) {
            var outbb = gui.getLowScaleBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
        }
        else {
            var outbb = gui.getOutputBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
        }
        var args = {id: punctum.id, episemaform: "horizontal", ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
        if (!hasEpisema) {
            // send add dot command to server to change underlying MEI
            $.post(gui.apiprefix + "/insert/episema", args)
                .error(function () {
                    gui.showAlert("Server failed to add a dot to the punctum. Client and server are not synchronized.");
                });
        }
        else {
            // send remove dot command to server to change underlying MEI
            $.post(gui.apiprefix + "/delete/episema", args)
                .error(function () {
                    gui.showAlert("Server failed to remove dot from the punctum. Client and server are not synchronized.");
                });
        }

        $(this).toggleClass("active");
    }
}

Toe.View.SquareNoteInteraction.prototype.handleVertEpisemaToggle = function(e) {
    var gui = e.data.gui;
    var punctum = e.data.punctum;

    var hasEpisema = punctum.components[0].hasOrnament("episema");
    var episemaForm = "vertical";

    if(hasEpisema){
        episemaForm = punctum.components[0].getOrnamentForm("episema");
    }

    if(episemaForm == "horizontal"){
        gui.showAlert("Cannot have both horizontal and vertical episemas");
    }
    else {
        if (!hasEpisema) {
            // add a vertical episema
            var ornament = new Toe.Model.Ornament("episema", {form: "vertical"});
            punctum.components[0].addOrnament(ornament);
        }
        else {
            // remove vertical episema
            punctum.components[0].removeOrnament("episema");
        }

        // update neume drawing
        punctum.syncDrawing();

        // get final bounding box information
        if (gui.lowScale) {
            var outbb = gui.getLowScaleBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
        }
        else {
            var outbb = gui.getOutputBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
        }
        var args = {id: punctum.id, episemaform: "vertical", ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
        if (!hasEpisema) {
            // send add dot command to server to change underlying MEI
            $.post(gui.apiprefix + "/insert/episema", args)
                .error(function () {
                    gui.showAlert("Server failed to add a dot to the punctum. Client and server are not synchronized.");
                });
        }
        else {
            // send remove dot command to server to change underlying MEI
            $.post(gui.apiprefix + "/delete/episema", args)
                .error(function () {
                    gui.showAlert("Server failed to remove dot from the punctum. Client and server are not synchronized.");
                });
        }

        $(this).toggleClass("active");
    }
}

Toe.View.SquareNoteInteraction.prototype.handleDotToggle = function(e) {
    var gui = e.data.gui;
    var punctum = e.data.punctum;

    var hasDot = punctum.components[0].hasOrnament("dot");
    if (!hasDot) {
        // add a dot
        var ornament = new Toe.Model.Ornament("dot", {form: "aug"});
        punctum.components[0].addOrnament(ornament);
    }
    else {
        // remove the dot
        punctum.components[0].removeOrnament("dot");
    }

    // update neume drawing
    punctum.syncDrawing();

    // get final bounding box information
    if (gui.lowScale) {
        var outbb = gui.getLowScaleBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
    }
    else {
        var outbb = gui.getOutputBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
    }
    var args = {id: punctum.id, dotform: "aug", ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
    if (!hasDot) {
        // send add dot command to server to change underlying MEI
        $.post(gui.apiprefix + "/insert/dot", args)
        .error(function() {
            gui.showAlert("Server failed to add a dot to the punctum. Client and server are not synchronized.");
        });
    }
    else {
        // send remove dot command to server to change underlying MEI
        $.post(gui.apiprefix + "/delete/dot", args)
        .error(function() {
            gui.showAlert("Server failed to remove dot from the punctum. Client and server are not synchronized.");
        });
    }

    $(this).toggleClass("active");
}

Toe.View.SquareNoteInteraction.prototype.handleHeadShapeChange = function(e) {
    var gui = e.data.gui;
    var shape = e.data.shape;
    var punctum = e.data.punctum;
    var nc = punctum.components[0];

    nc.setHeadShape(shape);

    // deal with head shapes that change the neume name
    if (shape == "virga") {
        punctum.name = "Virga";
        punctum.typeid = "virga";
    }
    else if (shape == "cavum") {
        punctum.name = "Cavum";
        punctum.typeid = "cavum";
    }

    // update drawing
    punctum.syncDrawing();
    if (gui.lowScale) {
        var outbb = gui.getLowScaleBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
    }
    else {
        var outbb = gui.getOutputBoundingBox([punctum.zone.ulx, punctum.zone.uly, punctum.zone.lrx, punctum.zone.lry]);
    }
    var args = {id: punctum.id, shape: shape, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};

    // send change head command to server to change underlying MEI
    $.post(gui.apiprefix + "/update/neume/headshape", args)
    .error(function() {
        gui.showAlert("Server failed to change note head shape. Client and server are not synchronized.");
    });
}

Toe.View.SquareNoteInteraction.prototype.handleClefShapeChange = function(e) {
    var gui = e.data.gui;
    var clef = e.data.clef;
    var cShape = e.data.shape;

    if (clef.shape != cShape) {
        clef.setShape(cShape);

        var neumesOnSystem = clef.system.getPitchedElements({neumes: true, custos: false});
        if (neumesOnSystem.length > 0 && clef.system.getActingClefByEle(neumesOnSystem[0]) == clef) {
            // if the shift of the clef has affected the first neume on this system
            // update the custos on the previous system
            var prevSystem = gui.page.getPreviousSystem(clef.system);
            if (prevSystem) {
                var newPname = neumesOnSystem[0].components[0].pname;
                var newOct = neumesOnSystem[0].components[0].oct;
                gui.handleUpdatePrevCustos(newPname, newOct, prevSystem);
            }
        }

        var pitchInfo = $.map(clef.system.getPitchedElements({clef: clef}), function(e) {
            if (e instanceof Toe.Model.Neume) {
                var pitchInfo = new Array();
                $.each(e.components, function(nInd, n) {
                    pitchInfo.push({pname: n.pname, oct: n.oct});
                });
                return {id: e.id, noteInfo: pitchInfo};
            }
            else if (e instanceof Toe.Model.Custos) {
                // the custos has been vertically moved
                // update the custos bounding box information in the model
                // do not need to update pitch name & octave since this does not change
                if (gui.lowScale) {
                    var outbb = gui.getLowScaleBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                }
                else {
                    var outbb = gui.getOutputBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                }
                $.post(gui.apiprefix + "/move/custos", {id: e.id, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]})
                .error(function() {
                    gui.showAlert("Server failed to move custos. Client and server are not synchronized.");
                });
            }
        });
        if (gui.lowScale) {
            var outbb = gui.getLowScaleBoundingBox([clef.zone.ulx, clef.zone.uly, clef.zone.lrx, clef.zone.lry]);
        }
        else {
            var outbb = gui.getOutputBoundingBox([clef.zone.ulx, clef.zone.uly, clef.zone.lrx, clef.zone.lry]);
        }
        var args = {id: clef.id, shape: cShape, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3], pitchInfo: pitchInfo};

        // send pitch shift command to server to change underlying MEI
        $.post(gui.apiprefix + "/update/clef/shape", {data: JSON.stringify(args)})
        .error(function() {
            gui.showAlert("Server failed to update clef shape. Client and server are not synchronized.");
        });

        $(this).toggleClass("active");
    }
};

Toe.View.SquareNoteInteraction.prototype.handleDivisionShapeChange = function(e) {
    var gui = e.data.gui;
    var division = e.data.division;
    var type = e.data.type;

    // changing the bounding box depending on
    if (type === "div_final") {
        if (division.zone.lrx - division.zone.ulx < gui.punctWidth - 0.01) {
            division.zone.lrx += gui.punctWidth;
        }
    }
    else {
        division.zone.lrx = division.zone.ulx;
    }

    division.setShape(type);

    // post to change the mei file
    if (gui.lowScale) {
        var outbb = gui.getLowScaleBoundingBox([division.zone.ulx, division.zone.uly, division.zone.lrx, division.zone.lry]);
    }
    else {
        var outbb = gui.getOutputBoundingBox([division.zone.ulx, division.zone.uly, division.zone.lrx, division.zone.lry]);
    }
    var args = {id: division.id, type: type, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
    $.post(gui.apiprefix + "/update/division/shape", {data: JSON.stringify(args)})
        .error(function() {
            gui.showAlert("Server failed to update division shape. Client and server are not synchronized.");
        });
}

Toe.View.SquareNoteInteraction.prototype.handleQuickNeumify = function(e) {
    var gui = e.data.gui;
    var modifier = e.data.modifier;

    // only need to neumify if a group of objects are selected
    var selection = gui.rendEng.canvas.getActiveGroup();
    if (selection) {
        // there is something selected
        // make sure there are at least 2 neumes on the same system to work with
        var neumes = new Array();
        var sModel = null;
        $.each(selection.getObjects(), function (oInd, o) {
            if (o.eleRef instanceof Toe.Model.Neume) {
                if (!sModel) {
                    sModel = o.eleRef.system;
                }

                if (o.eleRef.system == sModel) {
                    neumes.push(o);
                }
            }
        });

        if (neumes.length < 2) {
            return;
        }

        // sort the group based on x position (why fabric doesn't do this, I don't know)
        neumes.sort(function(o1, o2) {
            return o1.eleRef.zone.ulx - o2.eleRef.zone.ulx;
        });

        // begin the NEUMIFICATION
        var newNeume = new Toe.Model.SquareNoteNeume({modifier: modifier});

        numPunct = 0;
        var nids = new Array();
        var ulx = Number.MAX_VALUE;
        var uly = Number.MAX_VALUE;
        var lry = Number.MIN_VALUE;

        $.each(neumes, function (oInd, o) {
            var nModel = o.eleRef;

            // grab underlying notes
            $.merge(newNeume.components, o.eleRef.components);
            numPunct += o.eleRef.components.length;

            // update neume ids
            nids.push(o.eleRef.id);

            //calculate object's absolute positions from within selection group
            var left = selection.left + o.left;
            var top = selection.top + o.top;

            ulx = Math.min(ulx, left - o.currentHeight / 2);
            uly = Math.min(uly, top - o.currentHeight / 2);
            lry = Math.max(lry, top + o.currentHeight / 2);
        });
        var lrx = ulx + numPunct * gui.punctWidth;

        // set the bounding box hint of the new neume for drawing
        var bb = [ulx, uly, lrx, lry];
        newNeume.setBoundingBox(bb);

        // instantiate neume view and controller
        var nView = new Toe.View.NeumeView(gui.rendEng, gui.page.documentType);
        var nCtrl = new Toe.Ctrl.NeumeController(newNeume, nView);

        // render the new neume
        sModel.addNeume(newNeume);

        // get final bounding box information
        if (gui.lowScale) {
            var outbb = gui.getLowScaleBoundingBox([newNeume.zone.ulx, newNeume.zone.uly, newNeume.zone.lrx, newNeume.zone.lry]);
        }
        else {
            var outbb = gui.getOutputBoundingBox([newNeume.zone.ulx, newNeume.zone.uly, newNeume.zone.lrx, newNeume.zone.lry]);
        }

        var typeid = newNeume.typeid;

        // get note head shapes to change in underlying mei
        var headShapes = $.map(newNeume.components, function (nc) {
            return nc.props.type;
        });

        if (nView.drawing.height != 0) {
            //remove initial grouped neumes
            $.each(neumes, function (oInd, o) {
                sModel.removeElementByRef(o.eleRef);
                gui.rendEng.canvas.remove(o);
            });

            var data = JSON.stringify({
                "nids": nids.join(","),
                "typeid": typeid,
                "headShapes": headShapes,
                "ulx": outbb[0],
                "uly": outbb[1],
                "lrx": outbb[2],
                "lry": outbb[3]
            });
            // call server neumify function to update MEI
            $.post(gui.apiprefix + "/neumify", {data: data}, function (data) {
                // set id of the new neume with generated ID from the server
                newNeume.id = JSON.parse(data).id;
                gui.hideAlert();
            })
                .error(function () {
                    gui.showAlert("Server failed to neumify selected neumes. Client and server are not synchronized.");
                });

            gui.rendEng.canvas.discardActiveGroup();

            // select the new neume
            $(newNeume).trigger("vSelectDrawing");

            gui.rendEng.repaint();
        }
        else {
            gui.showAlert("Not a valid grouping. Click on 'Help' to access groupings glossary or select grouping from dropdown.");
        }
    }
}
Toe.View.SquareNoteInteraction.prototype.handleNeumify = function(e) {
    var gui = e.data.gui;
    var modifier = e.data.modifier;
    var groupType = $('#group_shape').find(':selected').attr('value');
    // check for liquisence
    if (groupType == "Epiphonus" || groupType == "Cephalicus") {
        modifier = "alt";
    }

    // only need to neumify if a group of objects are selected
    var selection = gui.rendEng.canvas.getActiveGroup();
    if (selection) {
        // there is something selected
        // make sure there are at least 2 neumes on the same system to work with
        var neumes = new Array();
        var sModel = null;
        $.each(selection.getObjects(), function (oInd, o) {
            if (o.eleRef instanceof Toe.Model.Neume) {
                if (!sModel) {
                    sModel = o.eleRef.system;
                }

                if (o.eleRef.system == sModel) {
                    neumes.push(o);
                }
            }
        });

        if (neumes.length < 2) {
            return;
        }

        // sort the group based on x position (why fabric doesn't do this, I don't know)
        neumes.sort(function(o1, o2) {
            return o1.eleRef.zone.ulx - o2.eleRef.zone.ulx;
        });

        // begin the NEUMIFICATION
        var newNeume = new Toe.Model.SquareNoteNeume({modifier: modifier});

        numPunct = 0;
        var nids = new Array();
        var ulx = Number.MAX_VALUE;
        var uly = Number.MAX_VALUE;
        var lry = Number.MIN_VALUE;

        $.each(neumes, function (oInd, o) {
            var nModel = o.eleRef;

            // grab underlying notes
            $.merge(newNeume.components, o.eleRef.components);
            numPunct += o.eleRef.components.length;

            // update neume ids
            nids.push(o.eleRef.id);

            //calculate object's absolute positions from within selection group
            var left = selection.left + o.left;
            var top = selection.top + o.top;

            ulx = Math.min(ulx, left - o.currentHeight / 2);
            uly = Math.min(uly, top - o.currentHeight / 2);
            lry = Math.max(lry, top + o.currentHeight / 2);
        });
        var lrx = ulx + numPunct * gui.punctWidth;

        // set the bounding box hint of the new neume for drawing
        var bb = [ulx, uly, lrx, lry];
        newNeume.setBoundingBox(bb);

        // instantiate neume view and controller
        var nView = new Toe.View.NeumeView(gui.rendEng, gui.page.documentType);
        var nCtrl = new Toe.Ctrl.NeumeController(newNeume, nView);

        // render the new neume
        sModel.addNeume(newNeume);

        // get final bounding box information
        if (gui.lowScale) {
            var outbb = gui.getLowScaleBoundingBox([newNeume.zone.ulx, newNeume.zone.uly, newNeume.zone.lrx, newNeume.zone.lry]);
        }
        else {
            var outbb = gui.getOutputBoundingBox([newNeume.zone.ulx, newNeume.zone.uly, newNeume.zone.lrx, newNeume.zone.lry]);
        }

        var typeid = newNeume.typeid;

        // get note head shapes to change in underlying mei
        var headShapes = $.map(newNeume.components, function (nc) {
            return nc.props.type;
        });

        if (newNeume.name != groupType) {
            gui.showAlert("Not a valid grouping. Click on 'Help' to access Grouping Glossary.");
            sModel.removeElementByRef(newNeume);
            $("#group_shape").val("null");
        }
        else if (nView.drawing.height != 0) {
            //remove initial grouped neumes
            $.each(neumes, function (oInd, o) {
                sModel.removeElementByRef(o.eleRef);
                gui.rendEng.canvas.remove(o);
            });

            var data = JSON.stringify({
                "nids": nids.join(","),
                "typeid": typeid,
                "headShapes": headShapes,
                "ulx": outbb[0],
                "uly": outbb[1],
                "lrx": outbb[2],
                "lry": outbb[3]
            });
            // call server neumify function to update MEI
            $.post(gui.apiprefix + "/neumify", {data: data}, function (data) {
                // set id of the new neume with generated ID from the server
                newNeume.id = JSON.parse(data).id;
                gui.hideAlert();
            })
                .error(function () {
                    gui.showAlert("Server failed to neumify selected neumes. Client and server are not synchronized.");
                });

            gui.rendEng.canvas.discardActiveGroup();

            // select the new neume
            $(newNeume).trigger("vSelectDrawing");

            gui.rendEng.repaint();

            $("#group_shape").val("null");
        }
    }
}

Toe.View.SquareNoteInteraction.prototype.handleUngroup = function(e) {
    var gui = e.data.gui;

    var neumes = new Array();

    var selection = gui.rendEng.canvas.getActiveObject();
    if (selection) {
        if (selection.eleRef instanceof Toe.Model.Neume && selection.eleRef.components.length > 1) {
            neumes.push(selection);
        }
    }
    else {
        selection = gui.rendEng.canvas.getActiveGroup();
        if (selection) {
            // group of elements selected
            $.each(selection.getObjects(), function(oInd, o) {
                // only deal with neumes with that have more components than a punctum
                if (o.eleRef instanceof Toe.Model.Neume && o.eleRef.components.length > 1) {
                    neumes.push(o);
                }
            });
        }
    }

    var nids = new Array();
    var bbs = new Array();
    var punctums = new Array();

    // ungroup each selected neume
    $.each(neumes, function(oInd, o) {
        // add to list of neume ids
        nids.push(o.eleRef.id);

        var punctBoxes = new Array();
        var ulx = o.eleRef.zone.ulx;

        // remove the old neume
        o.eleRef.system.removeElementByRef(o.eleRef);
        gui.rendEng.canvas.remove(o);

        $.each(o.eleRef.components, function(ncInd, nc) {
            var newPunct = new Toe.Model.SquareNoteNeume();
            newPunct.components.push(nc);

            var uly = o.eleRef.system.zone.uly - (o.eleRef.rootSystemPos + nc.pitchDiff)*o.eleRef.system.delta_y/2 - gui.punctHeight/2;
            // set the bounding box hint of the new neume for drawing
            var bb = [ulx+(ncInd*gui.punctWidth), uly, ulx+((ncInd+1)*gui.punctWidth), uly+gui.punctHeight];
            newPunct.setBoundingBox(bb);

            // instantiate neume view and controller
            var nView = new Toe.View.NeumeView(gui.rendEng, gui.page.documentType);
            var nCtrl = new Toe.Ctrl.NeumeController(newPunct, nView);

            // add the punctum to the system and draw it
            o.eleRef.system.addNeume(newPunct);

            // get final bounding box information
            if (gui.lowScale) {
                var outbb = gui.getLowScaleBoundingBox([newPunct.zone.ulx, newPunct.zone.uly, newPunct.zone.lrx, newPunct.zone.lry]);
            }
            else {
                var outbb = gui.getOutputBoundingBox([newPunct.zone.ulx, newPunct.zone.uly, newPunct.zone.lrx, newPunct.zone.lry]);
            }
            punctBoxes.push({"ulx": outbb[0], "uly": outbb[1], "lrx": outbb[2], "lry": outbb[3]});

            punctums.push(newPunct);
        });

        // add to list of neume bounding boxes
        bbs.push(punctBoxes);
    });

    var data = JSON.stringify({"nids": nids.join(","), "bbs": bbs});

    // call server ungroup function to update MEI
    $.post(gui.apiprefix + "/ungroup", {data: data}, function(data) {
        // set ids of the new puncta from the IDs generated from the server
        var nids = JSON.parse(data).nids;
        // flatten array of nested nid arrays (if ungrouping more than one neume)
        nids = $.map(nids, function(n) {
            return n;
        });

        $.each(punctums, function(i, punct) {
            punct.id = nids[i];
        });
    })
    .error(function() {
        gui.showAlert("Server failed to ungroup selected neumes. Client and server are not synchronized.");
    });

    gui.rendEng.canvas.discardActiveObject();
    gui.rendEng.canvas.discardActiveGroup();
    gui.rendEng.repaint();
}

/* handleMergeSystems
 *
 * 1. Putting both systems into an array
 * 2. Take values from the two systems, including elements and which one is empty
 * 3. Creating a new system
 * 3a. Adding elements
 * 4. Helper function for deleting systems
 * 5. Deleting the old systems
 */

Toe.View.SquareNoteInteraction.prototype.handleMergeSystems = function(e) {
    var gui = e.data.gui;

    // 1. first we need to store both of the systems into a single array
    var activeGroupObjects = gui.rendEng.canvas.getActiveGroup().objects;
    var systems = new Array();
    $.each(activeGroupObjects, function(index, ele) {
        if (ele.eleRef instanceof Toe.Model.System) {
            systems.push(ele);
        }
    });

    // 2. we need to determine which system to delete (the empty one!), and take the values from it
    var elementStorage;
    var emptyZone;
    var fullZone;
    var arraySystemID = new Array();
    var arraySystemBreakID = new Array();
    var fullSystemIndex;
    var newOrderNumber = Math.min(systems[0].eleRef.orderNumber, systems[1].eleRef.orderNumber);

    $.each(systems, function (index, ele) {
        if (ele.eleRef.elements.length != 0) {
            elementStorage = ele.eleRef.elements;
            fullZone = ele.eleRef.zone;
            fullSystemIndex = index;
        }
        else {
            emptyZone = ele.eleRef.zone;
        }
        arraySystemID.push(ele.eleRef.systemId);
        arraySystemBreakID.push(ele.eleRef.id);
    });

    if(!elementStorage){
        gui.showAlert("Merge cannot be done. System is missing a clef or neither system is empty.");
        return;
    }

    // 3. creating a new system with the proper dimensions and replacing the elements and fixing their bb
    newUlx = Math.min(emptyZone.ulx, fullZone.ulx);
    newLrx = Math.max(emptyZone.lrx, fullZone.lrx);
    newUly = Math.round( (emptyZone.uly + fullZone.uly) /2 );
    newLry = Math.round( (emptyZone.lry + fullZone.lry) /2 );

    if (gui.lowScale) {
        var newBB = gui.getLowScaleBoundingBox([newUlx, newUly, newLrx, newLry]);
    }
    else {
        var newBB = gui.getOutputBoundingBox([newUlx, newUly, newLrx, newLry]);
    }

    var system = new Toe.Model.SquareNoteSystem([newUlx, newUly, newLrx, newLry]);
    var systemView = new Toe.View.SystemView(gui.rendEng);
    var systemController = new Toe.Ctrl.SystemController(system, systemView);

    // We also have to adjust the associated system break order number.  Then, we can add it to the page.
    // This MIGHT have an impact on systems after it.
    system.setOrderNumber(newOrderNumber);
    gui.page.addSystem(system);
    gui.updateInsertSystemSubControls();
    var nextSystem = gui.page.getNextSystem(system);

    // POST system, then cascade into other POSTs.
    var createSystemArguments = {pageid: gui.page.getID(), ulx: newBB[0], uly: newBB[1], lrx: newBB[2], lry: newBB[3]};

    $.post(gui.apiprefix + "/insert/system", createSystemArguments, function(data) {
            system.setSystemID(JSON.parse(data).id);
            postSystemBreak();
        })
        .error(function() {
            gui.showAlert("Server failed to insert system.  Client and server are not synchronized.");
        });

    // POST system break.
    function postSystemBreak() {
        // Create arguments.
        var createSystemBreakArguments = {ordernumber: system.orderNumber, systemid: system.systemId};
        if (nextSystem != null) {
            createSystemBreakArguments.nextsbid = nextSystem.id;
        }

        // Do POST.  If we had to reorder system breaks, POST those, too.
        $.post(gui.apiprefix + "/insert/systembreak", createSystemBreakArguments, function(data) {
                system.setID(JSON.parse(data).id);
                while (nextSystem != null) {
                    gui.postSystemBreakEditOrder(nextSystem.id, nextSystem.orderNumber);
                    nextSystem = gui.page.getNextSystem(nextSystem);
                }
                mountElements();
                finishMerge();
            })
            .error(function() {
                gui.showAlert("Server failed to insert system break.  Client and server are not synchronized.");
            });
    }

    // 3a. mounting all the elements onto the new system
    var mountElements = function () {
        var delta_y = fullZone.uly - newUly
        $.each(elementStorage, function (index, ele) {
            // shifting the BB according to the difference in merging systems
            if (gui.lowScale) {
                var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx, ele.zone.uly + delta_y, ele.zone.lrx, ele.zone.lry  + delta_y]);
            }
            else {
                var outbb = gui.getOutputBoundingBox([ele.zone.ulx, ele.zone.uly + delta_y, ele.zone.lrx, ele.zone.lry  + delta_y]);
            }
            var args = {ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};

            if (ele instanceof Toe.Model.Clef) {
                // creating clef to post to new system
                var cModel = new Toe.Model.Clef(ele.shape, ele.props.systemPos);
                cModel.setBoundingBox(outbb);

                // instantiate clef view and controller
                var cView = new Toe.View.ClefView(gui.rendEng);
                var cCtrl = new Toe.Ctrl.ClefController(cModel, cView);

                // mount clef on the system
                var nInd = system.addClef(cModel);

                var systemLine = system.props.numLines + ele.props.systemPos / 2;

                args["shape"] = ele.shape;
                args["line"] = systemLine;

                // get next element to insert before
                if (nInd + 1 < system.elements.length) {
                    args["beforeid"] = system.elements[nInd + 1].id;
                }
                else {
                    // insert before the next system break
                    var sNextModel = gui.page.getNextSystem(system);
                    if (sNextModel) {
                        args["beforeid"] = sNextModel.id;
                    }
                }
                args["pitchInfo"] = null;
                var data = JSON.stringify(args);

                // send insert clef command to the server to change underlying MEI
                $.post(gui.apiprefix + "/insert/clef", {data: data}, function (data) {
                        cModel.id = JSON.parse(data).id;
                    })
                    .error(function () {
                        gui.showAlert("Server failed to insert clef. Client and server are not synchronized.");
                    });
            }
            if (ele instanceof Toe.Model.Neume) {
                // creating neume to post to new system
                for (var i = 0; i < ele.components.length; i++) {
                    var nModel = new Toe.Model.SquareNoteNeume();
                    var pname = ele.components[i].pname;
                    var oct = ele.components[i].oct;

                    var delta_x = (ele.zone.lrx - ele.zone.ulx) / ele.components.length;
                    if (gui.lowScale) {
                        var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx + (i*delta_x), ele.zone.uly + delta_y, ele.zone.lrx + (i*delta_x), ele.zone.lry  + delta_y]);
                    }
                    else {
                        var outbb = gui.getOutputBoundingBox([ele.zone.ulx + (i*delta_x), ele.zone.uly + delta_y, ele.zone.lrx + (i*delta_x), ele.zone.lry  + delta_y]);
                    }
                    var args = {ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};

                    args["pname"] = pname;
                    args["oct"] = oct;
                    args["name"] = ele.name;

                    // TODO: get these ornaments to transfer properly, look at insert punctum code
                    // var ornaments = new Array();
                    // args["dotform"] = null;
                    // args["episemaform"] = null;

                    var nc = new Toe.Model.SquareNoteNeumeComponent(pname, oct, {type: ele.components[0].props.type});
                    nModel.addComponent(nc);

                    // instantiate neume view and controller
                    var nView = new Toe.View.NeumeView(gui.rendEng, gui.page.documentType);
                    var nCtrl = new Toe.Ctrl.NeumeController(nModel, nView);

                    // mount neume on system
                    nInd = system.addNeume(nModel);

                    var sNextModel = gui.page.getNextSystem(system);
                    if (sNextModel) {
                        args["beforeid"] = sNextModel.id;
                    }

                    // Posting to the MEI
                    $.post(gui.apiprefix + "/insert/neume", args, function (data) {
                            nModel.id = JSON.parse(data).id;
                        })
                        .error(function () {
                            gui.showAlert("Server failed to insert neume. Client and server are not synchronized.");
                        });
                }

            }
            if (ele instanceof Toe.Model.Custos) {
                var pname = ele.pname;
                var oct = ele.oct;

                var cModel = new Toe.Model.Custos(pname, oct);

                args["pname"] = pname;
                args["oct"] = oct;

                cModel.setBoundingBox(outbb);

                // instantiate custos view and controller
                var cView = new Toe.View.CustosView(gui.rendEng);
                var cCtrl = new Toe.Ctrl.CustosController(cModel, cView);

                // mount the custos on the system
                system.setCustos(cModel);

                args["id"] = cModel.id
                // get id of the next system element
                var nextSystem = gui.page.getNextSystem(system);

                if (nextSystem) {
                    args["beforeid"] = nextSystem.id;
                }

                // update underlying MEI file
                $.post(gui.apiprefix + "/insert/custos", args, function(data) {
                    cModel.id = JSON.parse(data).id;
                }).error(function() {
                    gui.showAlert("Server failed to insert custos. Client and server are not synchronized.");
                });
            }
            if (ele instanceof Toe.Model.Division) {
                // creating division to post to new system
                var division = new Toe.Model.Division(ele.key);
                division.setBoundingBox(outbb);

                // instantiate division view and controller
                var dView = new Toe.View.DivisionView(gui.rendEng);
                var dCtrl = new Toe.Ctrl.DivisionController(division, dView);

                var nInd = system.addDivision(division);

                args["type"] = ele.key.slice(4)

                var sNextModel = gui.page.getNextSystem(system);
                if(sNextModel) {
                    args["beforeid"] = sNextModel.id;
                }

                // send insert division command to server to change underlying MEI
                $.post(gui.apiprefix + "/insert/division", args, function (data) {
                        division.id = JSON.parse(data).id;
                    })
                    .error(function () {
                        gui.showAlert("Server failed to insert division. Client and server are not synchronized.");
                    });
            }
        });
    }

    // 4. helper function for deleting systems
    var adjustedSystemBreakArray = [];
    var deleteSystem = function(aSystem) {
        var systemElementReference = aSystem.eleRef;
        var returnedArray = gui.page.removeSystem(systemElementReference);

        adjustedSystemBreakArray = adjustedSystemBreakArray.concat(returnedArray);
        gui.rendEng.canvas.remove(aSystem);

        if (adjustedSystemBreakArray.length > 0) {
            var uniqueAdjustedSystemBreakArray = [];
            $.each(adjustedSystemBreakArray, function(i, el){
                if($.inArray(el, uniqueAdjustedSystemBreakArray) === -1) uniqueAdjustedSystemBreakArray.push(el);
            });

            // Remove each.
            for (var i = 0; i < adjustedSystemBreakArray.length; i++) {
                gui.postSystemBreakEditOrder(adjustedSystemBreakArray[i].id, adjustedSystemBreakArray[i].orderNumber);
            }
        }

        gui.postSystemDelete(new Array(systemElementReference.systemId));
        gui.postSystemBreakDelete(new Array(systemElementReference.id));
    };

    // 5. code for actually deleting the system! + adjusting system breaks after the deleted
    var finishMerge = function () {
        for (var i = systems[fullSystemIndex].eleRef.elements.length-1; i >= 0; i--) {
            // we must delete elements from the mei
            if (systems[fullSystemIndex].eleRef.elements[i] instanceof Toe.Model.Clef) {
                var info = [{id: systems[fullSystemIndex].eleRef.elements[i].id, pitchInfo: null}];
                $.post(gui.apiprefix + "/delete/clef", {data: JSON.stringify(info)})
                    .error(function() {
                        gui.showAlert("Server failed to delete clef. Client and server are not synchronized.");
                    });
            }
            else if (systems[fullSystemIndex].eleRef.elements[i] instanceof Toe.Model.Neume) {
                $.post(gui.apiprefix + "/delete/neume",  {ids: systems[fullSystemIndex].eleRef.elements[i].id})
                    .error(function() {
                        gui.showAlert("Server failed to delete neume. Client and server are not synchronized.");
                    });
            }
            else if (systems[fullSystemIndex].eleRef.elements[i] instanceof Toe.Model.Division) {
                $.post(gui.apiprefix + "/delete/division", {ids: systems[fullSystemIndex].eleRef.elements[i].id})
                    .error(function() {
                        gui.showAlert("Server failed to delete division. Client and server are not synchronized.");
                    });
            }
            else if (systems[fullSystemIndex].eleRef.elements[i] instanceof Toe.Model.Custos) {
                $.post(gui.apiprefix + "/delete/custos", {ids: systems[fullSystemIndex].eleRef.elements[i].id})
                    .error(function() {
                        gui.showAlert("Server failed to delete custos. Client and server are not synchronized.");
                    });
            }

            // we delete the elements from fabric
            systems[fullSystemIndex].eleRef.removeElementByRef(systems[fullSystemIndex].eleRef.elements[i]);
            gui.rendEng.canvas.remove(systems[fullSystemIndex].eleRef.elements[i]);

        }
        deleteSystem(systems[0]);
        deleteSystem(systems[1]);
        gui.showInfo("Merging Systems, this may take a minute!")
        var call = "merge";
        gui.handleRefresh(e, call);
    }
}

Toe.View.SquareNoteInteraction.prototype.handleStaffLock = function(e) {
    var gui = e.data.gui;
    allObjects = gui.rendEng.canvas.getObjects();
    if ($("#btn_stafflock").is(":checked")){
        allObjects.map( function (ele) {
            if (ele.eleRef instanceof Toe.Model.System) {
                ele.selectable = false;
            }
            // TODO: System locations are not updating when moved so notes dont update properly
            // eleSystem.lockMovementX = true;
            // eleSystem.lockMovementY = true;
        })
    }
    else{
        allObjects.map( function (ele) {
            if (ele.eleRef instanceof Toe.Model.System) {
                ele.selectable = true;
            }
            // TODO: System locations are not updating when moved so notes dont update properly
            // eleSystem.lockMovementX = false;
            // eleSystem.lockMovementY = false;
        })
    }
}

Toe.View.SquareNoteInteraction.prototype.handleSelectAll = function(e) {
    var gui = e.data.gui;
    // deactivating the current active group
    gui.rendEng.canvas.deactivateAll();

    // collecting all the objects and setting them active
    var objs = gui.rendEng.canvas.getObjects().map(function(o) {
        return o.set('active', true);
    });

    // putting the objects into a group
    var group = new fabric.Group(objs, {
        originX: 'center',
        originY: 'center'
    });

    // putting the group as the active group
    gui.rendEng.canvas.setActiveGroup(group.setCoords()).renderAll();
}

/**************************************************
 *                  INSERT                        *
 **************************************************/
Toe.View.SquareNoteInteraction.prototype.handleInsert = function(e) {
    var gui = e.data.gui;
    var parentDivId = e.data.parentDivId;
    gui.hideInfo();
    gui.deactivateCanvasObjects();
    gui.removeInsertControls();
    gui.unbindInsertControls();
    gui.removeEditControls();
    gui.unbindEditControls();
    gui.unbindEditSubControls();
    gui.unbindEventHandlers();
    gui.insertInsertControls(parentDivId);
}

Toe.View.SquareNoteInteraction.prototype.handleInsertPunctum = function(e) {
    var gui = e.data.gui;
    gui.unbindEventHandlers();
    gui.removeInsertSubControls();

    // add ornamentation toggles
    if ($("#menu_insertpunctum").length == 0) {
        $("#sidebar-insert").append('<span id="menu_insertpunctum"><br/>\n' +
                                    '<p> Select Head Shape\n </p><select name="head_shape" id="head_shape">' +
                                    '<option id="head_punctum" value="punctum" data-imagesrc="/static/img/selectimages/punctum.png">Punctum</option>\n' +
                                    '<option id="head_punctum_inclinatum" value="punctum_inclinatum" data-imagesrc="/static/img/selectimages/diamond.png">Punctum Inclinatum</option>\n' +
                                    '<option id="head_punctum_inclinatum_parvum" value="punctum_inclinatum_parvum" data-imagesrc="/static/img/selectimages/diamond_small.png">Punctum Inclinatum Parvum</option>\n' +
                                    '<option id="head_cavum" value="cavum" data-imagesrc="/static/img/selectimages/white_punct.png">Cavum</option>\n' +
                                    '<option id="head_virga" value="virga" data-imagesrc="/static/img/selectimages/virga.png">Virga</option>\n' +
                                    '<option id="head_quilisma" value="quilisma" data-imagesrc="/static/img/selectimages/quilisma.png">Quilisma</option>\n' +
                                    '<option id="head_custos" value="custos" data-imagesrc="/static/img/selectimages/custos.png">Custos</option></select>\n' +
                                    '<li class="nav-header">Ornamentation</li>\n' +
                                    '<li><div class="btn-group" data-toggle="buttons-checkbox">\n' +
                                    '<button id="chk_dot" class="btn">&#149; Dot</button>\n' +
                                    '<button id="chk_horizepisema" class="btn"><i class="icon-resize-horizontal"></i> Episema</button>\n' +
                                    '<button id="chk_vertepisema" class="btn"><i class="icon-resize-vertical"></i> Episema</button>\n</div></li></span>')
    }

    // ornamentation toggle flags
    var hasDot = false;
    var noteType = "punctum";
    var typeName = "punctum";
    var hasHorizEpisema = false;
    var hasVertEpisema = false;

    // keep the scope of the punctum drawing insert local
    // to not pollute the global namespace when inserting other
    // musical elements
    var updateFollowPunct = function(initial) {
        if(!hasHorizEpisema){
            $('#chk_vertepisema').prop('disabled', false);
        }

        if(!hasVertEpisema){
            $('#chk_horizepisema').prop('disabled', false);
        }
        var elements = {modify: new Array(), fixed: new Array()};

        var punctPos = null;

        if (typeName == "Punctum"){
            var punctGlyph = gui.rendEng.getGlyph("punctum");
        }

        else if(typeName == "Punctum Inclinatum"){
            var punctGlyph = gui.rendEng.getGlyph("diamond");
        }

        else if(typeName == "Punctum Inclinatum Parvum"){
            var punctGlyph = gui.rendEng.getGlyph("diamond_small");
        }

        else if(typeName == "Cavum"){
            var punctGlyph = gui.rendEng.getGlyph("whitepunct");
        }

        else if(typeName == "Virga"){
            var punctGlyph = gui.rendEng.getGlyph("virga");
        }

        else if(typeName == "Quilisma"){
            var punctGlyph = gui.rendEng.getGlyph("quilisma");
        }

        else if(typeName == "Custos"){
            var punctGlyph = gui.rendEng.getGlyph("custos");
        }
        if (initial) {
            // draw the punctum off the screen, initially
            var punctPos = {left: -50, top: -50};
        }
        else {
            var punctPos = {left: gui.punctDwg.left, top: gui.punctDwg.top};

            if (hasDot) {
                var glyphDot = gui.rendEng.getGlyph("dot");
                var dot = glyphDot.clone().set({left: punctPos.left + gui.punctWidth, top: punctPos.top, opacity: 0.6});
                elements.modify.push(dot);
            }

            if (hasHorizEpisema) {
                $('#chk_vertepisema').prop('disabled', true);
                var glyphHorizEpisema = gui.rendEng.getGlyph("horizepisema");
                var horizEpisema = glyphHorizEpisema.clone().set({left: punctPos.left, top: punctPos.top - gui.punctHeight/4, opacity: 0.6});
                elements.modify.push(horizEpisema);
            }

            if (hasVertEpisema) {
                $('#chk_horizepisema').prop('disabled', true);
                var glyphVertEpisema = gui.rendEng.getGlyph("vertepisema");
                var vertEpisema = glyphVertEpisema.clone().set({left: punctPos.left, top: punctPos.top + gui.punctHeight, opacity: 0.6});
                elements.modify.push(vertEpisema);
            }
        }

        // create clean punctum glyph with no ornamentation
        var punct = punctGlyph.clone().set({left: punctPos.left, top: punctPos.top, opacity: 0.6});
        elements.modify.push(punct);

        // remove old punctum drawing following the pointer
        if (gui.punctDwg) {
            gui.rendEng.canvas.remove(gui.punctDwg);
        }

        // replace with new punctum drawing
        gui.punctDwg = gui.rendEng.draw(elements, {group: true, selectable: false, repaint: true})[0];
    };

    // using ddslick select library for images
    $("#head_shape").ddslick({
        onSelected: function(data) {
            noteType = data.selectedData.value;
            typeName = data.selectedData.text;
            updateFollowPunct(true);
        }
    });
    // put the punctum off the screen for now

    // render transparent punctum at pointer location
    gui.rendEng.canvas.observe('mouse:move', function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);
        gui.punctDwg.left = pnt.x - gui.punctDwg.currentWidth/4;
        gui.punctDwg.top = pnt.y - gui.punctDwg.currentHeight/4;

        gui.rendEng.repaint();
    });

    // deal with punctum insert
    gui.rendEng.canvas.observe('mouse:up', function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);
        // check for the pointer being in the canvas
        if (pnt.x > 0 && pnt.x < gui.rendEng.canvas.getWidth() && pnt.y > 0 && pnt.y < gui.rendEng.canvas.getHeight()) {
            // exception for custos
            if (noteType == "custos"){
                var coords = {x: gui.punctDwg.left, y: gui.punctDwg.top};
                var sModel = gui.page.getClosestSystem(coords);
                custos = sModel.custos;
                
                // calculate snapped coords
                var snapCoords = sModel.getSystemSnapCoordinates(coords, gui.punctDwg.currentWidth);

                // get pitch name and octave of snapped coords of note
                var noteInfo = sModel.calcPitchFromCoords(snapCoords);
                // simple check here for if theres a clef placed on the staff.
                if (noteInfo == null) {
                    gui.showAlert("No clef placed on the staff.");
                }
                // simple check here to see if theres a custos already placed on the staff
                else if (custos) {
                    gui.showAlert("Custos already placed on staff.");
                }
                else {
                    var pname = noteInfo["pname"];
                    var oct = noteInfo["oct"];

                    // instantiate a custos
                    var cModel = new Toe.Model.Custos(pname, oct);

                    // update bounding box with physical position on the page
                    var ulx = snapCoords.x - gui.punctDwg.currentWidth / 2;
                    var uly = snapCoords.y - gui.punctDwg.currentHeight / 2;
                    var bb = [ulx, uly, ulx + gui.punctDwg.currentWidth, uly + gui.punctDwg.currentHeight];
                    cModel.setBoundingBox(bb);

                    //  start forming arguments for the server function call
                    var args = {pname: pname, oct: oct};

                    // instantiate custos view and controller
                    var cView = new Toe.View.CustosView(gui.rendEng);
                    var cCtrl = new Toe.Ctrl.CustosController(cModel, cView);

                    // mount the custos on the system
                    sModel.setCustos(cModel);

                    if (gui.lowScale) {
                        var outbb = gui.getLowScaleBoundingBox([cModel.zone.ulx, cModel.zone.uly, cModel.zone.lrx, cModel.zone.lry]);
                    }
                    else {
                        var outbb = gui.getOutputBoundingBox([cModel.zone.ulx, cModel.zone.uly, cModel.zone.lrx, cModel.zone.lry]);
                    }
                    var args = {id: cModel.id, pname: pname, oct: oct, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};

                    // get id of the next system element
                    var nextSystem = gui.page.getNextSystem(sModel);

                    if (nextSystem) {
                        args["beforeid"] = nextSystem.id;
                    }

                    // update underlying MEI file
                    $.post(gui.apiprefix + "/insert/custos", args, function(data) {
                        cModel.id = JSON.parse(data).id;
                    }).error(function() {
                        gui.showAlert("Server failed to insert custos. Client and server are not synchronized.");
                    });
                }
            }
            // regular neume insertion
            else {
                var coords = {x: gui.punctDwg.left, y: gui.punctDwg.top};
                var sModel = gui.page.getClosestSystem(coords);

                // instantiate a punctum
                var nModel = new Toe.Model.SquareNoteNeume();

                // calculate snapped coords
                var snapCoords = sModel.getSystemSnapCoordinates(coords, gui.punctDwg.currentWidth);

                // update bounding box with physical position on the page
                var ulx = snapCoords.x - gui.punctDwg.currentWidth / 2;
                var uly = snapCoords.y - gui.punctDwg.currentHeight / 2;
                var bb = [ulx, uly, ulx + gui.punctDwg.currentWidth, uly + gui.punctDwg.currentHeight];
                nModel.setBoundingBox(bb);

                // get pitch name and octave of snapped coords of note
                var  noteInfo = sModel.calcPitchFromCoords(snapCoords);

                if (noteInfo == null) {
                    gui.showAlert("No clef placed on the staff.");
                } //Simple check here for if theres a clef placed on the staff.
                else {
                    var pname = noteInfo["pname"];
                    var oct = noteInfo["oct"];

                    //  start forming arguments for the server function call
                    var args = {pname: pname, oct: oct};

                    // check ornamentation toggles to add to component
                    var ornaments = new Array();
                    if (hasDot) {
                        ornaments.push(new Toe.Model.Ornament("dot", {form: "aug"}));
                        args["dotform"] = "aug";
                    }

                    if (hasHorizEpisema) {
                        ornaments.push(new Toe.Model.Ornament("episema", {form: "horizontal"}));
                        args["episemaform"] = "horizontal";
                    }

                    if (hasVertEpisema) {
                        ornaments.push(new Toe.Model.Ornament("episema", {form: "vertical"}));
                        args["episemaform"] = "vertical";
                    }

                    var nc = new Toe.Model.SquareNoteNeumeComponent(pname, oct, {type: noteType, ornaments: ornaments});
                    nModel.addComponent(nc);

                    // instantiate neume view and controller
                    var nView = new Toe.View.NeumeView(gui.rendEng, gui.page.documentType);
                    var nCtrl = new Toe.Ctrl.NeumeController(nModel, nView);

                    // mount neume on the system
                    var nInd = sModel.addNeume(nModel);

                    // if this is the first neume on a system, update the custos of the next system
                    if (nInd == 1) {
                        var prevSystem = gui.page.getPreviousSystem(sModel);
                        if (prevSystem) {
                            gui.handleUpdatePrevCustos(pname, oct, prevSystem);
                        }
                    }

                    // now that final bounding box is calculated from the drawing
                    // add the bounding box information to the server function arguments
                    if (gui.lowScale) {
                        var outbb = gui.getLowScaleBoundingBox([nModel.zone.ulx, nModel.zone.uly, nModel.zone.lrx, nModel.zone.lry]);
                    }
                    else {
                        var outbb = gui.getOutputBoundingBox([nModel.zone.ulx, nModel.zone.uly, nModel.zone.lrx, nModel.zone.lry]);
                    }
                    
                    args["ulx"] = outbb[0];
                    args["uly"] = outbb[1];
                    args["lrx"] = outbb[2];
                    args["lry"] = outbb[3];

                    // get next element to insert before
                    if (nInd + 1 < sModel.elements.length) {
                        args["beforeid"] = sModel.elements[nInd + 1].id;
                    }
                    else {
                        // insert before the next system break (system)
                        var sNextModel = gui.page.getNextSystem(sModel);
                        if (sNextModel) {
                            args["beforeid"] = sNextModel.id;
                        }
                    }

                    // Differentiate between different punctums
                    if(typeName == "Punctum Inclinatum"){
                        args["inclinatum"] = true;
                    }
                    else if(typeName == "Punctum Inclinatum Parvum"){
                        args["deminutus"] = true;
                        args["inclinatum"] = true;
                    }

                    //Get name of element
                    args["name"] = nModel.typeid;

                    // send insert command to server to change underlying MEI
                    $.post(gui.apiprefix + "/insert/neume", args, function (data) {
                            nModel.id = JSON.parse(data).id;
                        })
                        .error(function () {
                            gui.showAlert("Server failed to insert neume. Client and server are not synchronized.");
                        });
                }
            }
        }
    });

    $("#chk_dot").bind("click.insert", function() {
        // toggle dot
        if (!hasDot) {
            hasDot = true;
        }
        else {
            hasDot = false;
        }

        updateFollowPunct(false);
    });

    $("#chk_horizepisema").bind("click.insert", function() {
        if (!hasHorizEpisema) {
            hasHorizEpisema = true;
        }
        else {
            hasHorizEpisema = false;
        }
        updateFollowPunct(false);
    });

    $("#chk_vertepisema").bind("click.insert", function() {
        if (!hasVertEpisema) {
            hasVertEpisema = true;
        }
        else {
            hasVertEpisema = false;
        }
        updateFollowPunct(false);
    });
}

Toe.View.SquareNoteInteraction.prototype.handleInsertDivision = function(e) {
    var gui = e.data.gui;
    gui.unbindEventHandlers();
    gui.removeInsertSubControls();

    // add division type toggles
    if ($("#menu_insertdivision").length == 0) {
        $("#sidebar-insert").append('<span id="menu_insertdivision"><br/>\n<li class="nav-header">Division Type</li>\n' +
                                    '<li><div class="btn-group" data-toggle="buttons-radio">\n' +
                                    '<button id="rad_small" class="btn">Small</button>\n' +
                                    '<button id="rad_minor" class="btn">Minor</button>\n' +
                                    '<button id="rad_major" class="btn">Major</button>\n' +
                                    '<button id="rad_final" class="btn">Final</button>\n</div>\n</li>\n</span>');
    }

    var divisionForm = null;
    var system = null;

    gui.rendEng.canvas.observe('mouse:move', function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);

        // get closest system
        system = gui.page.getClosestSystem(pnt);

        var snapCoords = pnt;
        var divProps = {strokeWidth: 4, opacity: 0.6};
        switch (divisionForm) {
            case "div_small":
                snapCoords.y = system.zone.uly;

                if (!gui.divisionDwg) {
                    var y1 = system.zone.uly - system.delta_y/2;
                    var y2 = system.zone.uly + system.delta_y/2;
                    var x1 = snapCoords.x;

                    gui.divisionDwg = gui.rendEng.createLine([x1, y1, x1, y2], divProps);
                    gui.rendEng.draw({fixed: [gui.divisionDwg], modify: []}, {selectable: false, opacity: 0.6});
                }
                break;
            case "div_minor":
                snapCoords.y = system.zone.uly + (system.zone.lry - system.zone.uly)/2;

                if (!gui.divisionDwg) {
                    var y1 = system.zone.uly + system.delta_y/2;
                    var y2 = y1 + 2*system.delta_y;
                    var x1 = snapCoords.x;

                    gui.divisionDwg = gui.rendEng.createLine([x1, y1, x1, y2], divProps);
                    gui.rendEng.draw({fixed: [gui.divisionDwg], modify: []}, {selectable: false, opacity: 0.6});
                }
                break;
            case "div_major":
                snapCoords.y = system.zone.uly + (system.zone.lry - system.zone.uly)/2;

                if (!gui.divisionDwg) {
                    var y1 = system.zone.uly;
                    var y2 = system.zone.lry;
                    var x1 = snapCoords.x;

                    gui.divisionDwg = gui.rendEng.createLine([x1, y1, x1, y2], divProps);
                    gui.rendEng.draw({fixed: [gui.divisionDwg], modify: []}, {selectable: false, opacity: 0.6});
                }
                break;
            case "div_final":
                snapCoords.y = system.zone.uly + (system.zone.lry - system.zone.uly)/2;

                if (!gui.divisionDwg) {
                    var y1 = system.zone.uly;
                    var y2 = system.zone.lry;
                    var x1 = snapCoords.x;
                    // make width equal to width of punctum glyph
                    var x2 = snapCoords.x + gui.punctWidth;

                    var div1 = gui.rendEng.createLine([x1, y1, x1, y2], divProps);
                    var div2 = gui.rendEng.createLine([x2, y1, x2, y2], divProps);
                    gui.divisionDwg = gui.rendEng.draw({fixed: [div1, div2], modify: []}, {group: true, selectable: false, opacity: 0.6})[0];
                }
                break;
        }                    

        // snap the drawing to the system on the x-plane
        var dwgLeft = pnt.x - gui.divisionDwg.currentWidth/2;
        var dwgRight = pnt.x + gui.divisionDwg.currentWidth/2;
        if (system.elements[0] instanceof Toe.Model.Clef && dwgLeft <= system.elements[0].zone.lrx) {
            snapCoords.x = system.elements[0].zone.lrx + gui.divisionDwg.currentWidth/2 + 1;
        }
        else if (dwgLeft <= system.zone.ulx) {
            snapCoords.x = system.zone.ulx + gui.divisionDwg.currentWidth/2 + 1;
        }

        if (system.custos && dwgRight >= system.custos.zone.ulx) {
            // 3 is a magic number just to give it some padding
            snapCoords.x = system.custos.zone.ulx - gui.divisionDwg.currentWidth/2 - 3;
        }
        else if (dwgRight >= system.zone.lrx) {
            snapCoords.x = system.zone.lrx - gui.divisionDwg.currentWidth/2 - 3;
        }

        // move around the drawing
        gui.divisionDwg.left = snapCoords.x;
        gui.divisionDwg.top = snapCoords.y;
        gui.rendEng.repaint();
    });

    // handle the actual insertion
    gui.rendEng.canvas.observe('mouse:up', function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);
        // check for the pointer being in the canvas
        if (pnt.x > 0 && pnt.x < gui.rendEng.canvas.getWidth() && pnt.y > 0 && pnt.y < gui.rendEng.canvas.getHeight()) {
            // get coords
            var coords = {x: gui.divisionDwg.left, y: gui.divisionDwg.top};

            // calculate snapped coords
            var snapCoords = system.getSystemSnapCoordinates(coords, gui.divisionDwg.currentWidth);

            var division = new Toe.Model.Division(divisionForm);

            // update bounding box with physical position on the page
            var ulx = snapCoords.x - gui.divisionDwg.currentWidth / 2;
            var uly = snapCoords.y - gui.divisionDwg.currentHeight / 2;
            var bb = [ulx, uly, ulx + gui.divisionDwg.currentWidth, uly + gui.divisionDwg.currentHeight];
            division.setBoundingBox(bb);

            // instantiate division view and controller
            var dView = new Toe.View.DivisionView(gui.rendEng);
            var dCtrl = new Toe.Ctrl.DivisionController(division, dView);

            // mount division on the system
            var nInd = system.addDivision(division);

            if (gui.lowScale) {
                var outbb = gui.getLowScaleBoundingBox(bb);
            }
            else {
                var outbb = gui.getOutputBoundingBox(bb);
            }
            var args = {type: division.key.slice(4), ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
            // get next element to insert before
            if (nInd + 1 < system.elements.length) {
                args["beforeid"] = system.elements[nInd + 1].id;
            }
            else {
                // insert before the next system break (system)
                var sNextModel = gui.page.getNextSystem(system);
                if(sNextModel) {
                    args["beforeid"] = sNextModel.id;
                }
            }

            // send insert division command to server to change underlying MEI
            $.post(gui.apiprefix + "/insert/division", args, function (data) {
                    division.id = JSON.parse(data).id;
                })
                .error(function () {
                    gui.showAlert("Server failed to insert division. Client and server are not synchronized.");
                });
        }
    });

    $("#rad_small").bind("click.insert", function() {
        // remove the current division following the pointer
        if (gui.divisionDwg) {
            gui.rendEng.canvas.remove(gui.divisionDwg);
            gui.divisionDwg = null;
        }
        divisionForm = "div_small";
    });

    $("#rad_minor").bind("click.insert", function() {
        if (gui.divisionDwg) {
            gui.rendEng.canvas.remove(gui.divisionDwg);
            gui.divisionDwg = null;
        }
        divisionForm = "div_minor";
    });

    $("#rad_major").bind("click.insert", function() {
        if (gui.divisionDwg) {
            gui.rendEng.canvas.remove(gui.divisionDwg);
            gui.divisionDwg = null;
        }
        divisionForm = "div_major";
    });

    $("#rad_final").bind("click.insert", function() {
        if (gui.divisionDwg) {
            gui.rendEng.canvas.remove(gui.divisionDwg);
            gui.divisionDwg = null;
        }
        divisionForm = "div_final";
    });

    // toggle small division by default
    $("#rad_small").trigger('click');
}

Toe.View.SquareNoteInteraction.prototype.handleInsertSystem = function(e) {
    var gui = e.data.gui;
    gui.unbindEventHandlers();
    gui.removeInsertSubControls();
    gui.insertInsertSystemSubControls();
    gui.updateInsertSystemSubControls();

    // Get the widest system and use its dimensions.  If there is no widest system, forget it!
    var widestSystem = gui.page.getWidestSystem();
    if (widestSystem == null) {
        // TODO: Maybe add some default values if there are no systems in the document yet
        return;
    }

    // Create the drawing.
    gui.systemDrawing = null;
    var numberOfLines = widestSystem.props.numLines;
    var width = widestSystem.getWidth()/6;
    var deltaY = widestSystem.delta_y;
    var elements = {fixed: new Array(), modify: new Array()};
    for (var li = 0; li < numberOfLines; li++) {
        elements.fixed.push(gui.rendEng.createLine([0, deltaY * li, width, deltaY * li]));
    }
    gui.systemDrawing = gui.rendEng.draw(elements, {group: true, selectable: false, opacity: 0.6})[0];

    // Move the drawing with the pointer.
    gui.rendEng.canvas.observe("mouse:move", function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);
        gui.systemDrawing.left = pnt.x;
        gui.systemDrawing.top = pnt.y;
        gui.rendEng.repaint();
    });

    // Do the insert.
    gui.rendEng.canvas.observe('mouse:up', function(e) {

        // Create bounding box and system then add MVC components.
        var ulx = gui.systemDrawing.left - Math.round(gui.systemDrawing.currentWidth / 2);
        var uly = gui.systemDrawing.top - Math.round(gui.systemDrawing.currentHeight / 2);
        var boundingBox = [ulx, uly, ulx + gui.systemDrawing.currentWidth, uly + gui.systemDrawing.currentHeight];
        var system = new Toe.Model.SquareNoteSystem(boundingBox);
        var systemView = new Toe.View.SystemView(gui.rendEng);
        var systemController = new Toe.Ctrl.SystemController(system, systemView);

        // We also have to adjust the associated system break order number.  Then, we can add it to the page.
        // This MIGHT have an impact on systems after it.
        system.setOrderNumber($('#system_number_slider').val());
        gui.page.addSystem(system);
        gui.updateInsertSystemSubControls();
        var nextSystem = gui.page.getNextSystem(system);

        // Create arguments for our first POST.
        if (gui.lowScale) {
            var outbb = gui.getLowScaleBoundingBox([system.zone.ulx, system.zone.uly, system.zone.lrx, system.zone.lry]);
        }
        else {
            var outbb = gui.getOutputBoundingBox([system.zone.ulx, system.zone.uly, system.zone.lrx, system.zone.lry]);
        }
        var createSystemArguments = {pageid: gui.page.getID(), ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};

        // POST system, then cascade into other POSTs.
        $.post(gui.apiprefix + "/insert/system", createSystemArguments, function(data) {
            system.setSystemID(JSON.parse(data).id);
            postSystemBreak();
        })
        .error(function() {
            gui.showAlert("Server failed to insert system.  Client and server are not synchronized.");
        });

        // POST system break.
        function postSystemBreak() {
            // Create arguments.
            var createSystemBreakArguments = {ordernumber: system.orderNumber, systemid: system.systemId};
            if (nextSystem != null) {
                createSystemBreakArguments.nextsbid = nextSystem.id;
            }

            // Do POST.  If we had to reorder system breaks, POST those, too.
            $.post(gui.apiprefix + "/insert/systembreak", createSystemBreakArguments, function(data) {
                system.setID(JSON.parse(data).id);
                while (nextSystem != null) {
                    gui.postSystemBreakEditOrder(nextSystem.id, nextSystem.orderNumber);
                    nextSystem = gui.page.getNextSystem(nextSystem);
                }
                $("#btn_edit").click();
            })
            .error(function() {
                gui.showAlert("Server failed to insert system break.  Client and server are not synchronized.");
            });
        }
    });
}

Toe.View.SquareNoteInteraction.prototype.handleInsertClef = function(e) {
    var gui = e.data.gui;
    var passingE = e;
    gui.unbindEventHandlers();
    gui.removeInsertSubControls();

    // add clef type toggles
    if ($("#menu_insertclef").length == 0) {
        $("#sidebar-insert").append('<span id="menu_insertclef"><br/>\n<li class="nav-header">Clef Type</li>\n' +
                                    '<li><div class="btn-group" data-toggle="buttons-radio">\n' +
                                    '<button id="rad_doh" class="btn">C</button>\n' +
                                    '<button id="rad_fah" class="btn">F</button>\n' +
                                    '</div>\n</li>\n</span>');
    }

    // current clef shape being inserted.
    var cShape = null;

    // move the drawing with the pointer
    gui.rendEng.canvas.observe("mouse:move", function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);

        var xOffset = 0;
        var yOffset = 0;
        // calculate pointer offset
        // are mostly magic numbers to make the interface look pretty
        // but these are relative scalings to the glyph size so it will
        // work for all global scalings.
        if (cShape == "c") {
            xOffset = gui.clefDwg.currentWidth/4;
        }
        else {
            xOffset = gui.clefDwg.currentWidth/8;
            yOffset = gui.clefDwg.currentHeight/8;
        }
        gui.clefDwg.left = pnt.x - xOffset;
        gui.clefDwg.top = pnt.y + yOffset;

        gui.rendEng.repaint();
    });

    // handle the actual insertion
    gui.rendEng.canvas.observe("mouse:up", function(e) {
        var pnt = gui.rendEng.canvas.getPointer(e.e);

        var autoRefresh = false;

        // check for the pointer being in the canvas
        if (pnt.x > 0 && pnt.x < gui.rendEng.canvas.getWidth() && pnt.y > 0 && pnt.y < gui.rendEng.canvas.getHeight()) {
            // get coords
            var coords = {x: gui.clefDwg.left, y: gui.clefDwg.top};

            if (cShape == "f") {
                coords.x -= gui.clefDwg.currentWidth / 8;
                coords.y -= gui.clefDwg.currentHeight / 8;
            }

            // get closest system to insert onto
            var system = gui.page.getClosestSystem(coords);

            var snapCoords;

            // calculate snapped coordinates on the system
            if(system.elements[0] instanceof Toe.Model.Clef && coords.x > system.zone.ulx){
                snapCoords = coords;
            }
            else{
                snapCoords = system.getSystemSnapCoordinates(coords, gui.clefDwg.currentWidth);
            }

            var systemPos = Math.round((system.zone.uly - snapCoords.y) / (system.delta_y / 2));

            var clef = new Toe.Model.Clef(cShape, {"systemPos": systemPos});

            // update bounding box with physical position on page
            var ulx = snapCoords.x - gui.clefDwg.currentWidth / 2;
            var uly = snapCoords.y - gui.clefDwg.currentHeight / 2;
            var bb = [ulx, uly, ulx + gui.clefDwg.currentWidth, uly + gui.clefDwg.currentHeight];
            clef.setBoundingBox(bb);

            // instantiate clef view and controller
            var cView = new Toe.View.ClefView(gui.rendEng);
            var cCtrl = new Toe.Ctrl.ClefController(clef, cView);

            // mount clef on the system
            var nInd = system.addClef(clef);

            var systemLine = system.props.numLines + systemPos / 2;
            if (gui.lowScale) {
                var outbb = gui.getLowScaleBoundingBox([clef.zone.ulx, clef.zone.uly, clef.zone.lrx, clef.zone.lry]);
            }
            else {
                var outbb = gui.getOutputBoundingBox([clef.zone.ulx, clef.zone.uly, clef.zone.lrx, clef.zone.lry]);
            }
            var args = {shape: cShape, line: systemLine, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
            // get next element to insert before
            if (nInd + 1 < system.elements.length) {
                args["beforeid"] = system.elements[nInd + 1].id;
            }
            else {
                // insert before the next system break
                var sNextModel = gui.page.getNextSystem(system);
                if (sNextModel) {
                    args["beforeid"] = sNextModel.id;
                }
            }

            var neumesOnSystem = system.getPitchedElements({neumes: true, custos: false});
            if (neumesOnSystem.length > 0 && system.getActingClefByEle(neumesOnSystem[0]) == clef) {
                // if the shift of the clef has affected the first neume on this system
                // update the custos on the previous system
                var prevSystem = gui.page.getPreviousSystem(system);
                if (prevSystem) {
                    var newPname = neumesOnSystem[0].components[0].pname;8
                    var newOct = neumesOnSystem[0].components[0].oct;
                    gui.handleUpdatePrevCustos(newPname, newOct, prevSystem);
                }
            }

            // If this is the first clef on the system tell the user to refresh
            if (system.elements[0] == clef) {
                autoRefresh = true;
                gui.showInfo("The changes you've made required a refresh to appear.");
            }

            // gather new pitch information of affected pitched elements
            args["pitchInfo"] = $.map(system.getPitchedElements({clef: clef}), function (e) {
                if (e instanceof Toe.Model.Neume) {
                    var pitchInfo = new Array();
                    $.each(e.components, function (nInd, n) {
                        pitchInfo.push({pname: n.pname, oct: n.oct});
                    });
                    return {id: e.id, noteInfo: pitchInfo};
                }
                else if (e instanceof Toe.Model.Custos) {
                    // the custos has been vertically moved
                    // update the custos bounding box information in the model
                    // do not need to update pitch name & octave since this does not change
                    if (gui.lowScale) {
                        var outbb = gui.getLowScaleBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                    }
                    else {
                        var outbb = gui.getOutputBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                    }
                    $.post(gui.apiprefix + "/move/custos", {
                            id: e.id,
                            ulx: outbb[0],
                            uly: outbb[1],
                            lrx: outbb[2],
                            lry: outbb[3]
                        })
                        .error(function () {
                            gui.showAlert("Server failed to move custos. Client and server are not synchronized.");
                        });
                }
            });

            var data = JSON.stringify(args);

            // call server neumify function to update MEI
            $.post(gui.apiprefix + "/insert/clef", {data: data}, function (data) {
                clef.id = JSON.parse(data).id;
                if (autoRefresh) {
                    gui.handleRefresh(passingE);
                }
            })
                .error(function () {
                    gui.showAlert("Server failed to neumify selected neumes. Client and server are not synchronized.");
                });
        }
    });

    // release old bindings
    $("#rad_doh").unbind("click");
    $("#rad_fah").unbind("click");

    $("#rad_doh").bind("click.insert", function() {
        // only need to update following drawing if the clef
        // shape is different
        if (!$(this).hasClass("active")) {
            // initially set clefshape of the screen
            var cPos = {left: -50, top: -50};
            if (gui.clefDwg) {
                gui.rendEng.canvas.remove(gui.clefDwg);
                // draw the new clef at the old clef's location
                cPos = {left: gui.clefDwg.left, top: gui.clefDwg.top};
            }

            var cGlyph = gui.rendEng.getGlyph("c_clef");
            var clef = cGlyph.clone().set($.extend(cPos, {opacity: 0.6}));
            gui.clefDwg = gui.rendEng.draw({fixed: [], modify: [clef]}, {opacity: 0.6, selectable: false, repaint: true})[0];

            cShape = "c";
        }
    });

    $("#rad_fah").bind("click.insert", function() {
        // only need to update following drawing if the clef
        // shape is different
        if (!$(this).hasClass("active")) {
            // initially set clefshape of the screen
            var cPos = {left: -50, top: -50};
            if (gui.clefDwg) {
                gui.rendEng.canvas.remove(gui.clefDwg);
                // draw the new clef at the old clef's location
                cPos = {left: gui.clefDwg.left, top: gui.clefDwg.top};
            }

            var cGlyph = gui.rendEng.getGlyph("f_clef");
            var clef = cGlyph.clone().set($.extend(cPos, {opacity: 0.6}));
            gui.clefDwg = gui.rendEng.draw({fixed: [], modify: [clef]}, {opacity: 0.6, selectable: false, repaint: true})[0];

            cShape = "f";
        }
    });

    // toggle doh clef by default
    $("#rad_doh").trigger("click");
}

Toe.View.SquareNoteInteraction.prototype.handleUpdatePrevCustos = function(pname, oct, prevSystem) {
    var custos = prevSystem.custos;
    if (custos) {
        // update the custos
        custos.setRootNote(pname, oct);
        
        // get acting clef for the custos 
        var actingClef = prevSystem.getActingClefByEle(custos);
        custos.setRootSystemPos(prevSystem.calcSystemPosFromPitch(pname, oct, actingClef));
        if (this.lowScale) {
            var outbb = this.getLowScaleBoundingBox([custos.zone.ulx, custos.zone.uly, custos.zone.lrx, custos.zone.lry]);
        }
        else {
            var outbb = this.getOutputBoundingBox([custos.zone.ulx, custos.zone.uly, custos.zone.lrx, custos.zone.lry]);
        }
        $.post(this.apiprefix + "/move/custos", {id: custos.id, pname: pname, oct: oct, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]})
        .error(function() {
            gui.showAlert("Server failed to move custos. Client and server are not synchronized.");
        });
    }
    else {
        // insert a custos
        var cModel = new Toe.Model.Custos(pname, oct);

        // create bounding box hint
        var ulx = prevSystem.zone.lrx - gui.punctWidth/2;
        var uly = prevSystem.zone.uly; // probably not correct, but sufficient for the hint
        var bb = [ulx, uly, ulx + gui.punctWidth, uly + gui.punctHeight];
        cModel.setBoundingBox(bb);

        // instantiate custos view and controller
        var cView = new Toe.View.CustosView(gui.rendEng);
        var cCtrl = new Toe.Ctrl.CustosController(cModel, cView);

        // mount the custos on the system
        prevSystem.setCustos(cModel);
        if (this.lowScale) {
            var outbb = this.getLowScaleBoundingBox([cModel.zone.ulx, cModel.zone.uly, cModel.zone.lrx, cModel.zone.lry]);
        }
        else {
            var outbb = this.getOutputBoundingBox([cModel.zone.ulx, cModel.zone.uly, cModel.zone.lrx, cModel.zone.lry]);
        }
        var args = {id: cModel.id, pname: pname, oct: oct, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};

        // get id of the next system element
        var nextSystem = gui.page.getNextSystem(prevSystem);
        if (nextSystem) {
            args["beforeid"] = nextSystem.id;
        }

        // update underlying MEI file
        $.post(this.apiprefix + "/insert/custos", args, function(data) {
            cModel.id = JSON.parse(data).id;
        }).error(function() {
            gui.showAlert("Server failed to insert custos. Client and server are not synchronized.");
        });
    }
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit Methods
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Deletes the active selection.
 *
 * NOTE - moved out of handler to allow for deletion when no trigger is fired.
 */
Toe.View.SquareNoteInteraction.prototype.deleteActiveSelection = function(aGui) {
    // get current canvas selection
    // check individual selection and group selections
    toDelete = {clefs: [],
                nids: [],
                dids: [],
                cids: [],
                systemIdArray: [],
                systemBreakIdArray: []};

    // Some systems may have to be adjusted.
    var adjustedSystemBreakArray = [];

    var deleteClef = function(drawing, aIgnorePitchInfo) {
        var clef = drawing.eleRef;
        var system = clef.system;

        // get previous acting clef
        //  (NOTE: this should always be defined
        // since the first clef on a system should not be deleted if it has any notes dependant on it)
        var pClef = system.getPreviousClef(clef);

        // now delete the clef, and update the pitch information of these elements
        system.removeElementByRef(clef);

        // get references to pitched elements that will be changed after
        // the clef is deleted (but only if required).
        var pitchInfo = null;
        if (!aIgnorePitchInfo) {

            system.updatePitchedElements(pClef);
            var pitchedEles = system.getPitchedElements(clef);

            // gather the pitch information of the pitched notes
            pitchInfo = $.map(pitchedEles, function (e) {
                if (e instanceof Toe.Model.Neume) {
                    var pitchInfo = [];
                    $.each(e.components, function (nInd, n) {
                        pitchInfo.push({pname: n.pname, oct: n.oct});
                    });
                    return {id: e.id, noteInfo: pitchInfo};
                }
                else if (e instanceof Toe.Model.Custos) {
                    // the custos has been vertically moved
                    // update the custos bounding box information in the model
                    // do not need to update pitch name & octave since this does not change
                    if (aGui.lowScale) {
                        var outbb = aGui.getLowScaleBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                    }
                    else {
                        var outbb = aGui.getOutputBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                    }
                    $.post(aGui.apiprefix + "/move/custos", {
                        id: e.id,
                        ulx: outbb[0],
                        uly: outbb[1],
                        lrx: outbb[2],
                        lry: outbb[3]
                    })
                        .error(function () {
                            aGui.showAlert("Server failed to move custos. Client and server are not synchronized.");
                        });
                }
            });
        }

        toDelete.clefs.push({id: clef.id, pitchInfo: pitchInfo});

        aGui.rendEng.canvas.remove(drawing);
    };

    var deleteNeume = function(drawing) {
        var neume = drawing.eleRef;

        var neumesOnSystem = neume.system.getPitchedElements({neumes: true, custos: false});

        neume.system.removeElementByRef(neume);
        toDelete.nids.push(neume.id);

        aGui.rendEng.canvas.remove(drawing);

        if (neumesOnSystem.length == 1) {
            // there are no neumes left on the system
            // remove the custos from the previous system
            var prevSystem = aGui.page.getPreviousSystem(neume.system);
            if (prevSystem && prevSystem.custos) {
                prevSystem.custos.eraseDrawing();
                prevSystem.removeElementByRef(prevSystem.custos);

                // send the custos delete command to the server to update the underlying MEI
                $.post(aGui.apiprefix + "/delete/custos", {ids: prevSystem.custos.id})
                .error(function() {
                    gui.showAlert("Server failed to delete custos. Client and server are not synchronized.");
                });

                prevSystem.custos = null;
            }
        }
        else if (neume == neumesOnSystem[0]) {
            // if this neume is the first neume on the system
            // update the custos of the previous system
            var prevSystem = aGui.page.getPreviousSystem(neume.system);
            if (prevSystem && prevSystem.custos) {
                var custos = prevSystem.custos;
                var nextNeume = neumesOnSystem[1];
                var newPname = nextNeume.components[0].pname;
                var newOct = nextNeume.components[0].oct;
                
                var actingClef = prevSystem.getActingClefByEle(custos);
                var newSystemPos = prevSystem.calcSystemPosFromPitch(newPname, newOct, actingClef);

                custos.pname = newPname;
                custos.oct = newOct;
                custos.setRootSystemPos(newSystemPos);

                // the custos has been vertically moved
                // update the custos bounding box information in the model
                // do not need to update pitch name & octave since this does not change
                if (aGui.lowScale) {
                    var outbb = aGui.getLowScaleBoundingBox([custos.zone.ulx, custos.zone.uly, custos.zone.lrx, custos.zone.lry]);
                }
                else {
                    var outbb = gui.getOutputBoundingBox([custos.zone.ulx, custos.zone.uly, custos.zone.lrx, custos.zone.lry]);
                }
                $.post(aGui.apiprefix + "/move/custos",
                      {id: custos.id, pname: newPname, oct: newOct, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]})
                .error(function() {
                    gui.showAlert("Server failed to move custos. Client and server are not synchronized.");
                });
            }
        }
    };

    var deleteDivision = function(drawing) {
        var division = drawing.eleRef;

        division.system.removeElementByRef(division);
        toDelete.dids.push(division.id);

        aGui.rendEng.canvas.remove(drawing);
    };

    var deleteCustos = function(drawing) {
        var custos = drawing.eleRef;

        custos.system.removeElementByRef(custos);
        custos.system.custos = null;
        toDelete.cids.push(custos.id);

        aGui.rendEng.canvas.remove(drawing);
    };

    var deleteSystem = function(aDrawing) {
        var systemElementReference = aDrawing.eleRef;
        toDelete.systemBreakIdArray.push(systemElementReference.id);
        toDelete.systemIdArray.push(systemElementReference.systemId);

        // Remove all associated elements of the system.
        var elementIndex = 0;
        doneRemovingElements = false;
        while (!doneRemovingElements) {

            if (systemElementReference.elements.length === 0 || elementIndex >= systemElementReference.elements.length) {
                doneRemovingElements = true;
            }
            else {
                var subElement = systemElementReference.elements[elementIndex];
                var elementDrawing = subElement.view.drawing;
                if (subElement instanceof Toe.Model.Clef) {
                    deleteClef(elementDrawing, true);
                }
                else if (subElement instanceof Toe.Model.Neume) {
                    deleteNeume(elementDrawing);
                }
                else if (subElement instanceof Toe.Model.Division) {
                    deleteDivision(elementDrawing);
                }
                else if (subElement instanceof Toe.Model.Custos) {
                    deleteCustos(elementDrawing);
                }
                else {
                    elementIndex++;
                }
            }
        }
        var returnedArray = aGui.page.removeSystem(systemElementReference);
        adjustedSystemBreakArray = adjustedSystemBreakArray.concat(returnedArray);
        aGui.rendEng.canvas.remove(aDrawing);
    };

    var selection = aGui.rendEng.canvas.getActiveObject();
    if (selection) {
        //checks if selection is the first clef
        if (selection.eleRef instanceof Toe.Model.Clef && selection.eleRef.system.elements[0] != selection.eleRef) {
            deleteClef(selection, false);
        }
        // check if it is first clef and only delete if it is the only element on the staff
        else if (selection.eleRef instanceof Toe.Model.Clef && selection.eleRef.system.elements.length == 1) {
            deleteClef(selection, true);
        }
        else if (selection.eleRef instanceof Toe.Model.Neume) {
            deleteNeume(selection);
        }
        else if (selection.eleRef instanceof Toe.Model.Division) {
            deleteDivision(selection);
        }
        else if (selection.eleRef instanceof Toe.Model.Custos) {
            deleteCustos(selection);
        }
        else if (selection.eleRef instanceof Toe.Model.System) {
            deleteSystem(selection);
        }
        aGui.rendEng.repaint();
    }
    else {
        selection = aGui.rendEng.canvas.getActiveGroup();
        if (selection) {
            // group of elements selected
            $.each(selection.getObjects(), function(oInd, o) {
                // ignore the first clef, since this should never be deleted
                if (o.eleRef instanceof Toe.Model.Clef && o.eleRef.system.elements[0] != o.eleRef) {
                    deleteClef(o, false);
                }
                else if (o.eleRef instanceof Toe.Model.Neume) {
                    deleteNeume(o);
                }
                else if (o.eleRef instanceof Toe.Model.Division) {
                    deleteDivision(o);
                }
                else if (o.eleRef instanceof Toe.Model.Custos) {
                    deleteCustos(o);
                }
            });
            aGui.rendEng.canvas.discardActiveGroup();
            aGui.rendEng.repaint();
        }
    }

    // Call the server to delete stuff.
    if (toDelete.nids.length > 0) {
        // send delete command to server to change underlying MEI
        $.post(aGui.apiprefix + "/delete/neume",  {ids: toDelete.nids.join(",")})
        .error(function() {
            gui.showAlert("Server failed to delete neume. Client and server are not synchronized.");
        });
    }
    if (toDelete.dids.length > 0) {
        // send delete command to server to change underlying MEI
        $.post(aGui.apiprefix + "/delete/division", {ids: toDelete.dids.join(",")})
        .error(function() {
            gui.showAlert("Server failed to delete division. Client and server are not synchronized.");
        });
    }
    if (toDelete.cids.length > 0) {
        // send delete command to server to change underlying MEI
        $.post(aGui.apiprefix + "/delete/custos", {ids: toDelete.cids.join(",")})
        .error(function() {
            gui.showAlert("Server failed to delete custos. Client and server are not synchronized.");
        });
    }

    if (toDelete.clefs.length > 0) {
        // send delete command to the server to change underlying MEI
        $.post(aGui.apiprefix + "/delete/clef", {data: JSON.stringify(toDelete.clefs)})
        .error(function() {
            gui.showAlert("Server failed to delete clef. Client and server are not synchronized.");
        });
    }

    // Delete system and system breaks.
    if (toDelete.systemIdArray.length > 0) {
        aGui.postSystemDelete(toDelete.systemIdArray);
    }
    if (toDelete.systemBreakIdArray.length > 0) {
        aGui.postSystemBreakDelete(toDelete.systemBreakIdArray);
    }

    // Finally, may have had to adjust some systems.
    if (adjustedSystemBreakArray.length > 0) {

        // Remove duplicates first.
        var uniqueAdjustedSystemBreakArray = [];
        $.each(adjustedSystemBreakArray, function(i, el){
            if($.inArray(el, uniqueAdjustedSystemBreakArray) === -1) uniqueAdjustedSystemBreakArray.push(el);
        });

        // Remove each.
        for (var i = 0; i < adjustedSystemBreakArray.length; i++) {
            aGui.postSystemBreakEditOrder(adjustedSystemBreakArray[i].id, adjustedSystemBreakArray[i].orderNumber);
        }
    }
};


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// POST Methods
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
Toe.View.SquareNoteInteraction.prototype.postSystemBreakEditOrder = function(aSystemId, aOrderNumber) {
    $.post(this.apiprefix + "/modify/systembreak", {sbid: aSystemId, ordernumber: aOrderNumber})
    .error(function() {
        gui.showAlert("Server failed to modify system break.  Client and server are not synchronized.");
    });
}

Toe.View.SquareNoteInteraction.prototype.postSystemDelete = function(aSystemIdArray) {
    $.post(this.apiprefix + "/delete/system", {sids: aSystemIdArray.join(",")})
    .error(function() {
        gui.showAlert("Server failed to delete system.  Client and server are not synchronized.");
    });
}

Toe.View.SquareNoteInteraction.prototype.postSystemBreakDelete = function(aSystemBreakIdArray) {
    $.post(this.apiprefix + "/delete/systembreak", {sbids: aSystemBreakIdArray.join(",")})
    .error(function() {
        gui.showAlert("Server failed to delete system break.  Client and server are not synchronized.");
    });
}

Toe.View.SquareNoteInteraction.prototype.postModifySystemZone = function(aSystemId, aUlx, aUly, aLrx, aLry) {
    $.post(this.apiprefix + "/update/system/zone", {sid: aSystemId,
                                                    ulx: aUlx,
                                                    uly: aUly,
                                                    lrx: aLrx,
                                                    lry: aLry})
    .error(function() {
        gui.showAlert("Server failed to update system zone.  Client and server are not synchronized.");
    });
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Event Handler Methods
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
Toe.View.SquareNoteInteraction.prototype.handleDelete = function(e) {
    var gui = e.data.gui;
    gui.deleteActiveSelection(e.data.gui);
};

// TODO: Make duplication functional
// Duplicate works if you refresh the page but this interferes with the undo functionality. ALso need to add
// functionality for ornaments.
Toe.View.SquareNoteInteraction.prototype.handleDuplicate = function(e) {
    var gui = e.data.gui;

    var selection = gui.rendEng.canvas.getActiveGroup();
    if(!selection) {
       var selection =  gui.rendEng.canvas.getActiveObject();
    }

    if (selection) {
        var elements = new Array();
        if (selection.eleRef) {
            elements.push(selection);
        }
        else {
            $.each(selection.objects, function(ind, el) {
                elements.push(el);
            });
        }
        $.each(elements, function (oInd, o) {
            var ele =  o.eleRef;
            if (gui.lowScale) {
                var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
            }
            else {
                var outbb = gui.getOutputBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
            }
            var args = {ulx: outbb[0] + 30, uly: outbb[1], lrx: outbb[2] + 30, lry: outbb[3]};
            var sModel = ele.system;

            if (ele instanceof Toe.Model.Neume) {
                //creating neume to post to new system
                var nModel = new Toe.Model.SquareNoteNeume();

                // TODO: get these ornaments to transfer properly, look at insert punctum code
                // var ornaments = new Array();
                // args["dotform"] = null;
                // args["episemaform"] = null;
                var pname = ele.components[0].pname;
                var oct = ele.components[0].oct;

                args["pname"] = pname;
                args["oct"] = oct;
                args["name"] = ele.name;

                nModel.setBoundingBox(outbb);

                var nc = new Toe.Model.SquareNoteNeumeComponent(pname, oct, {type: ele.components[0].props.type});
                nModel.addComponent(nc);

                // instantiate neume view and controller
                var nView = new Toe.View.NeumeView(gui.rendEng, gui.page.documentType);
                var nCtrl = new Toe.Ctrl.NeumeController(nModel, nView);

                nModel.name = ele.name;
                nModel.rootSystemPos = ele.rootSystemPos;
                nModel.system = ele.system;
                nModel.typeid = ele.typeid;
                nModel.zone = {ulx: outbb[0] + (gui.punctWidth * 2), uly: outbb[1], lrx: outbb[2] + (gui.punctWidth * 2), lry: outbb[3]};

                // mount neume on system
                var nInd = ele.system.addNeume(nModel);

                if (nInd == 1) {
                    var prevSystem = gui.page.getPreviousSystem(sModel);
                    if (prevSystem) {
                        gui.handleUpdatePrevCustos(pname, oct, prevSystem);
                    }
                }

                var sNextModel = gui.page.getNextSystem(ele.system);
                if (sNextModel) {
                    args["beforeid"] = sNextModel.id;
                }

                // Posting to the MEI
                $.post(gui.apiprefix + "/insert/neume", args, function (data) {
                    nModel.id = JSON.parse(data).id;
                })
                    .error(function () {
                        gui.showAlert("Server failed to insert neume. Client and server are not synchronized.");
                    });
            }
            if (ele instanceof Toe.Model.Custos) {
                var pname = ele.pname;
                var oct = ele.oct;

                var cModel = new Toe.Model.Custos(pname, oct);

                args["pname"] = pname;
                args["oct"] = oct;

                cModel.setBoundingBox(outbb);

                // instantiate custos view and controller
                var cView = new Toe.View.CustosView(gui.rendEng);
                var cCtrl = new Toe.Ctrl.CustosController(cModel, cView);

                // mount the custos on the system
                ele.system.setCustos(cModel);

                args["id"] = cModel.id
                // get id of the next system element
                var nextSystem = gui.page.getNextSystem(ele.system);

                if (nextSystem) {
                    args["beforeid"] = nextSystem.id;
                }

                // update underlying MEI file
                $.post(gui.apiprefix + "/insert/custos", args, function(data) {
                    cModel.id = JSON.parse(data).id;
                }).error(function() {
                    gui.showAlert("Server failed to insert custos. Client and server are not synchronized.");
                });
            }
            if (ele instanceof Toe.Model.Division) {
                // creating division to post to new system
                var division = new Toe.Model.Division(ele.key);
                division.setBoundingBox(outbb);

                // instantiate division view and controller
                var dView = new Toe.View.DivisionView(gui.rendEng);
                var dCtrl = new Toe.Ctrl.DivisionController(division, dView);

                var nInd = ele.system.addDivision(division);

                args["type"] = ele.key.slice(4);

                var sNextModel = gui.page.getNextSystem(ele.system);
                if(sNextModel) {
                    args["beforeid"] = sNextModel.id;
                }

                // send insert division command to server to change underlying MEI
                $.post(gui.apiprefix + "/insert/division", args, function (data) {
                    division.id = JSON.parse(data).id;
                })
                    .error(function () {
                        gui.showAlert("Server failed to insert division. Client and server are not synchronized.");
                    });
            }
        });
    }
};

Toe.View.SquareNoteInteraction.prototype.handleRefresh = function(e, call) {
    var gui = e.data.gui;

    if(call){
        gui.handleDeleteUndos(gui);
    }
    apiprefix = gui.apiprefix;
    cutprefix = apiprefix.slice(5);

    if (gui.scaling[6]) {
        $('#neon-wrapper').neon({
            glyphpath: "/static/img/neumes_concat.svg",
            meipath: "/file" + cutprefix + ".mei",
            bgimgpath: "/file" + cutprefix + ".jpg",
            bgimgopacity: 0.5,
            documentType: "liber",
            apiprefix: apiprefix,
            width: 1200, // enforce width
            zoom: true
    });
    }
    else {
        $('#neon-wrapper').neon({
            glyphpath: "/static/img/neumes_concat.svg",
            meipath: "/file" + cutprefix + ".mei",
            bgimgpath: "/file" + cutprefix + ".jpg",
            bgimgopacity: 0.5,
            documentType: "liber",
            apiprefix: apiprefix,
            width: 1200, // enforce width
            zoom: false
        });
    }


    $("#btn_stafflock").prop("checked", true);
};

Toe.View.SquareNoteInteraction.prototype.handleZoom = function(e, call) {
    var gui = e.data.gui;

    if(call){
        gui.handleDeleteUndos(gui);
    }
    apiprefix = gui.apiprefix;
    cutprefix = apiprefix.slice(5);

    if (gui.scaling[6]) {
        $('#neon-wrapper').neon({
            glyphpath: "/static/img/neumes_concat.svg",
            meipath: "/file" + cutprefix + ".mei",
            bgimgpath: "/file" + cutprefix + ".jpg",
            bgimgopacity: 0.5,
            documentType: "liber",
            apiprefix: apiprefix,
            width: 1200, // enforce width
            zoom: false
    });
    }
    else {
        $('#neon-wrapper').neon({
            glyphpath: "/static/img/neumes_concat.svg",
            meipath: "/file" + cutprefix + ".mei",
            bgimgpath: "/file" + cutprefix + ".jpg",
            bgimgopacity: 0.5,
            documentType: "liber",
            apiprefix: apiprefix,
            width: 1200, // enforce width
            zoom: true
    });
    }

    $("#btn_stafflock").prop("checked", true);
};

Toe.View.SquareNoteInteraction.prototype.handleDeleteUndos = function(gui) {
    // delete files in undo folder
    $.post(gui.apiprefix + "/delete")
        .error(function() {
            gui.showAlert("Server failed to delete undos. Client and server are not synchronized.");
        });
};

Toe.View.SquareNoteInteraction.prototype.handleUndo = function(e) {
    var gui = e.data.gui;

    // move undo mei file to working directory
    $.post(gui.apiprefix + "/undo", function() {
        // when the backup file has been restored, reload the page
        gui.handleRefresh(e);
    })
        .error(function() {
            // show alert to user
            // replace text with error message
            $("#alert > p").text("Server failed to restore undo MEI file.");
            $("#alert").animate({opacity: 1.0}, 100);
        });
};

Toe.View.SquareNoteInteraction.prototype.handleArrowKeys = function (direction) {
    gui = this;
    selection = gui.rendEng.canvas.getActiveObject();
    var isGroup = false;

    // for handling single object movement
    if (selection) {
        switch(direction) {
            case "up":
                gui.objMoving = true;
                gui.handleObjectsMoved(0, selection.eleRef.system.delta_y/2, gui, selection);
                break;
            case "down":
                gui.objMoving = true;
                gui.handleObjectsMoved(0, -selection.eleRef.system.delta_y/2, gui, selection);
                break;
            default:
                this.showAlert("wuh woh");
        }
    }

    // For handling group movement
    else if (!selection) {
        // check for group selection
        selection = gui.rendEng.canvas.getActiveGroup();
        if (selection && selection.objects.length > 0) {
            isGroup = true;
        }
    }

    if (isGroup) {
        var storage = new fabric.Group(selection.objects, {
            left: selection.left,
            right: selection.right,
            hasBorders: true,
            borderColor: "red"
        });
        switch(direction) {
            case "up":
                gui.objMoving = true;
                gui.handleObjectsMoved(0, selection.objects[0].eleRef.system.delta_y/2, gui, selection);
                break;
            case "down":
                gui.objMoving = true;
                gui.handleObjectsMoved(0, -selection.objects[0].eleRef.system.delta_y/2, gui, selection);
                break;
            default:
                this.showAlert("wuh woh");
        }
        gui.rendEng.canvas.setActiveGroup(storage);
    }
}


Toe.View.SquareNoteInteraction.prototype.handleObjectsMoved = function(delta_x, delta_y, gui, elementArray) {
    // don't perform dragging action if the mouse doesn't move
    if (!gui.objMoving) {
        return;
    }

    // if elements are not passed as parameters, this is from active selection.
    // check for single selection
    if (!elementArray) {
        var selection = gui.rendEng.canvas.getActiveObject();
        if (!selection) {
            // check for group selection
            selection = gui.rendEng.canvas.getActiveGroup();
        }
    }
    else {
        selection = elementArray;
    }

    if (selection) {
        var elements = new Array();
        if (selection.eleRef) {
            elements.push(selection);
        }
        else {
            $.each(selection.objects, function(ind, el) {
                elements.push(el);
            });
        }

        $.each(elements, function(ind, element) {
            var ele = element.eleRef;

            if (ele instanceof Toe.Model.Clef) {
                // this is a clef
                var left = element.left;
                var top = element.top;
                if (elements.length > 1) {
                    // calculate object's absolute positions from within selection group
                    left = selection.left + element.left;
                    top = selection.top + element.top;
                }

                // snap release position to line/space
                var snappedCoords = ele.system.getSystemSnapCoordinates({x: left, y: top}, null, {ignoreEle: ele});

                // TODO clefs moving to different systems?

                // get system position of snapped coordinates
                var systemPos = -Math.round((snappedCoords.y - ele.system.zone.uly) / (ele.system.delta_y/2));

                ele.setSystemPosition(systemPos);

                var neumesOnSystem = ele.system.getPitchedElements({neumes: true, custos: false});
                if (neumesOnSystem.length > 0 && ele.system.getActingClefByEle(neumesOnSystem[0]) == ele) {
                    // if the shift of the clef has affected the first neume on this system
                    // update the custos on the previous system
                    var prevSystem = gui.page.getPreviousSystem(ele.system);
                    if (prevSystem) {
                        var newPname = neumesOnSystem[0].components[0].pname;
                        var newOct = neumesOnSystem[0].components[0].oct;
                        gui.handleUpdatePrevCustos(newPname, newOct, prevSystem);
                    }
                }

                // gather new pitch information of affected pitched elements
                var pitchInfo = $.map(ele.system.getPitchedElements({clef: ele}), function(e) {
                    if (e instanceof Toe.Model.Neume) {
                        var pitchInfo = new Array();
                        $.each(e.components, function(nInd, n) {
                            pitchInfo.push({pname: n.pname, oct: n.oct});
                        });
                        return {id: e.id, noteInfo: pitchInfo};
                    }
                    else if (e instanceof Toe.Model.Custos) {
                        // the custos has been vertically moved
                        // update the custos bounding box information in the model
                        // do not need to update pitch name & octave since this does not change
                        if (gui.lowScale) {
                            var outbb = gui.getLowScaleBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                        }
                        else {
                            var outbb = gui.getOutputBoundingBox([e.zone.ulx, e.zone.uly, e.zone.lrx, e.zone.lry]);
                        }
                        $.post(gui.apiprefix + "/move/custos", {id: e.id, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]})
                            .error(function() {
                                gui.showAlert("Server failed to move custos. Client and server are not synchronized.");
                            });
                    }
                });

                // convert systemPos to staffLine format used in MEI attribute
                var systemLine = ele.system.props.numLines + (ele.props.systemPos/2);
                if (gui.lowScale) {
                    var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                else {
                    var outbb = gui.getOutputBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                var args = {id: ele.id, line: systemLine, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3], pitchInfo: pitchInfo};

                // send pitch shift command to server to change underlying MEI
                $.post(gui.apiprefix + "/move/clef", {data: JSON.stringify(args)})
                    .error(function() {
                        gui.showAlert("Server failed to move clef. Client and server are not synchronized.");
                    });
            }
            else if (ele instanceof Toe.Model.Neume) {
                // we have a neume, this is a pitch shift

                var left = element.left;
                var top = element.top;
                if (elements.length > 1) {
                    // calculate object's absolute positions from within selection group
                    left = selection.left + element.left;
                    top = selection.top + element.top;
                }

                // get y position of first neume component
                var nc_y = ele.system.zone.uly - ele.rootSystemPos*ele.system.delta_y/2;
                var finalCoords = {x: left, y: nc_y - delta_y};

                var sModel = gui.page.getClosestSystem(finalCoords);

                // snap to system
                var snapCoords = sModel.getSystemSnapCoordinates(finalCoords, element.currentWidth, {ignoreEle: ele});

                var newRootSystemPos = Math.round((sModel.zone.uly - snapCoords.y) / (sModel.delta_y/2));

                // construct bounding box hint for the new drawing: bounding box changes when dot is repositioned
                var ulx = snapCoords.x-(element.currentWidth/2);
                var uly = top-(element.currentHeight/2)-(finalCoords.y-snapCoords.y);
                var bb = [ulx, uly, ulx + element.currentWidth, uly + element.currentHeight];

                ele.setBoundingBox(bb);

                var oldRootSystemPos = ele.rootSystemPos;
                // derive pitch name and octave of notes in the neume on the appropriate system
                $.each(ele.components, function(ncInd, nc) {
                    var noteInfo = sModel.calcPitchFromCoords({x: snapCoords.x, y: snapCoords.y - (sModel.delta_y/2 * nc.pitchDiff)});
                    nc.setPitchInfo(noteInfo["pname"], noteInfo["oct"]);
                });


                // remove the old neume
                $(ele).trigger("vEraseDrawing");
                ele.system.removeElementByRef(ele);
                // mount the new neume on the most appropriate system
                ele.padding = 2;

                var nInd = sModel.addNeume(ele);
                if (elements.length == 1) {
                    $(ele).trigger("vSelectDrawing");
                }

                if (gui.lowScale) {
                    var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                else {
                    var outbb = gui.getOutputBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                var args = {id: ele.id, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
                if (oldRootSystemPos != newRootSystemPos) {
                    // this is a pitch shift
                    args.pitchInfo = new Array();
                    $.each(ele.components, function(ncInd, nc) {
                        args.pitchInfo.push({"pname": nc.pname, "oct": nc.oct});
                    });

                    // if this element is the first neume on the system
                    if (ele == sModel.elements[1]) {
                        var prevSystem = gui.page.getPreviousSystem(sModel);
                        if (prevSystem) {
                            var cPname = ele.components[0].pname;
                            var cOct = ele.components[0].oct;
                            gui.handleUpdatePrevCustos(cPname, cOct, prevSystem);
                        }
                    }
                }
                else {
                    args.pitchInfo = null
                }

                // get next element to insert before
                if (nInd + 1 < sModel.elements.length) {
                    args["beforeid"] = sModel.elements[nInd+1].id;
                }
                else {
                    // insert before the next system break (system)
                    var sNextModel = gui.page.getNextSystem(sModel);
                    args["beforeid"] = sNextModel.id;
                }

                // send pitch shift command to server to change underlying MEI
                $.post(gui.apiprefix + "/move/neume", {data: JSON.stringify(args)})
                    .error(function() {
                        gui.showAlert("Server failed to move neume. Client and server are not synchronized.");
                    });
            }
            else if (ele instanceof Toe.Model.Division) {
                // this is a division
                var left = element.left;
                var top = element.top;
                if (elements.length > 1) {
                    // calculate object's absolute positions from within selection group
                    left += selection.left;
                    top += selection.top;
                }

                var finalCoords = {x: left, y: top};

                // get closest system
                var system = gui.page.getClosestSystem(finalCoords);

                var snapCoords = system.getSystemSnapCoordinates(finalCoords, element.currentWidth, {x: true, y: false});

                // get vertical snap coordinates for the appropriate system
                switch (ele.type) {
                    case Toe.Model.Division.Type.div_small:
                        snapCoords.y = system.zone.uly;
                        break;
                    case Toe.Model.Division.Type.div_minor:
                        snapCoords.y = system.zone.uly + (system.zone.lry - system.zone.uly)/2;
                        break;
                    case Toe.Model.Division.Type.div_major:
                        snapCoords.y = system.zone.uly + (system.zone.lry - system.zone.uly)/2;
                        break;
                    case Toe.Model.Division.Type.div_final:
                        snapCoords.y = system.zone.uly + (system.zone.lry - system.zone.uly)/2;
                        break;
                }

                // remove division from the previous system representation
                ele.system.removeElementByRef(ele);
                gui.rendEng.canvas.remove(element);
                gui.rendEng.repaint();

                // set bounding box hint
                var ulx = snapCoords.x - element.currentWidth/2;
                var uly = snapCoords.y - element.currentHeight/2;
                var bb = [ulx, uly, ulx + element.currentWidth, uly + element.currentHeight];
                ele.setBoundingBox(bb);

                // get id of note to move before
                var dInd = system.addDivision(ele);
                if (elements.length == 1) {
                    ele.selectDrawing();
                }

                var beforeid = null;
                if (dInd + 1 < system.elements.length) {
                    beforeid = system.elements[dInd+1].id;
                }
                else {
                    // insert before the next system break
                    var sNextModel = gui.page.getNextSystem(system);
                    beforeid = sNextModel.id;
                }

                if (gui.lowScale) {
                    var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                else {
                    var outbb = gui.getOutputBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                var data = {id: ele.id, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3], beforeid: beforeid};

                // send move command to the server to change underlying MEI
                $.post(gui.apiprefix + "/move/division", data)
                    .error(function() {
                        gui.showAlert("Server failed to move division. Client and server are not synchronized.");
                    });
            }
            else if (ele instanceof Toe.Model.Custos) {
                // we have a custos, this is a pitch shift

                var left = element.left;
                var top = element.top;
                if (elements.length > 1) {
                    // calculate object's absolute positions from within selection group
                    left = selection.left + element.left;
                    top = selection.top + element.top;
                }

                // get y position of first neume component
                var nc_y = ele.system.zone.uly - ele.rootSystemPos*ele.system.delta_y/2;
                var finalCoords = {x: left, y: nc_y - delta_y};

                var sModel = gui.page.getClosestSystem(finalCoords);

                // snap to system
                var snapCoords = sModel.getSystemSnapCoordinates(finalCoords, element.currentWidth, {ignoreEle: ele});

                var newRootSystemPos = Math.round((sModel.zone.uly - snapCoords.y) / (sModel.delta_y/2));
                // construct bounding box, hint for the new drawing: bounding box changes when dot is repositioned
                var ulx = snapCoords.x-(element.currentWidth/2);
                var uly = top-(element.currentHeight/2)-(finalCoords.y-snapCoords.y);
                var bb = [ulx, uly, ulx + element.currentWidth, uly + element.currentHeight];
                ele.setBoundingBox(bb);

                var oldRootSystemPos = ele.rootSystemPos;
                // derive pitch name and octave of notes in the neume on the appropriate system
                var noteInfo = sModel.calcPitchFromCoords({x: snapCoords.x, y: snapCoords.y});
                ele.setRootNote(noteInfo["pname"], noteInfo["oct"]);

                // remove the old neume
                $(ele).trigger("vEraseDrawing");
                ele.system.removeElementByRef(ele);

                // mount the new neume on the most appropriate system
                ele.padding = 2;
                var nInd = sModel.setCustos(ele);
                if (elements.length == 1) {
                    $(ele).trigger("vSelectDrawing");
                }

                if (gui.lowScale) {
                    var outbb = gui.getLowScaleBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                else {
                    var outbb = gui.getOutputBoundingBox([ele.zone.ulx, ele.zone.uly, ele.zone.lrx, ele.zone.lry]);
                }
                var args = {id: ele.id, ulx: outbb[0], uly: outbb[1], lrx: outbb[2], lry: outbb[3]};
                if (oldRootSystemPos != newRootSystemPos) {
                    // this is a pitch shift
                    args["pname"] = ele.pname;
                    args["oct"] = ele.oct;
                }
                else {
                    args.pitchInfo = null
                }

                // get next element to insert before
                if (nInd + 1 < sModel.elements.length) {
                    args["beforeid"] = sModel.elements[nInd+1].id;
                }
                else {
                    // insert before the next system break (system)
                    var sNextModel = gui.page.getNextSystem(sModel);
                    args["beforeid"] = sNextModel.id;
                }

                // send pitch shift command to server to change underlying MEI
                $.post(gui.apiprefix + "/move/custos", args)
                    .error(function() {
                        gui.showAlert("Server failed to move neume. Client and server are not synchronized.");
                    });
            }
        });
        if (elements.length > 1) {
            gui.rendEng.canvas.discardActiveGroup();
        }
        gui.rendEng.repaint();
    }
    // we're all done moving
    gui.objMoving = false;
}

Toe.View.SquareNoteInteraction.prototype.handleEventObjectModified = function(gui, aObject) {

    if (aObject.target.hasOwnProperty('eleRef')) {
        switch (aObject.target.eleRef.constructor) {
            // Switch on element reference type.
            case Toe.Model.SquareNoteSystem:
            {
                // Fabric uses the center of the object to calc. position.  We don't, so we adjust accordingly.
                aObject.target.eleRef.controller.modifyZone(aObject.target.getCenterPoint().x, aObject.target.currentWidth);

                if (this.scaling[6]) {
                    var outbb = this.getLowScaleBoundingBox([aObject.target.eleRef.zone.ulx, aObject.target.eleRef.zone.uly, aObject.target.eleRef.zone.lrx, aObject.target.eleRef.zone.lry]);
                }
                else {
                    var outbb = this.getOutputBoundingBox([aObject.target.eleRef.zone.ulx, aObject.target.eleRef.zone.uly, aObject.target.eleRef.zone.lrx, aObject.target.eleRef.zone.lry]);
                }

                // Make call to server.
                this.postModifySystemZone(aObject.target.eleRef.systemId,
                    Math.floor(outbb[0]),
                    Math.floor(outbb[1]),
                    Math.floor(outbb[2]),
                    Math.floor(outbb[3])
                );
                // Get the elements that became loose from the system.  Group them and delete.
                var looseElements = aObject.target.eleRef.getLooseElements();
                if (looseElements.length > 0) {
                    var looseElementDrawings = $.map(looseElements, function (aElement, aIndex) {
                        return aElement.view.drawing;
                    });
                    var looseElementGroup = new fabric.Group(looseElementDrawings);
                    this.rendEng.canvas.deactivateAll();
                    this.rendEng.canvas.setActiveGroup(looseElementGroup);
                    this.deleteActiveSelection(this);
                }
                break;
            }

            default:
            {
                break;
            }
        }
    }
};

Toe.View.SquareNoteInteraction.prototype.handleEventObjectSelected = function(aObject) {

    // Unbind and remove previous stuff.
    this.unbindEditSubControls();
    this.removeEditSubControls();

    $('#btn_delete').toggleClass('disabled', false);
    $('#btn_duplicate').toggleClass('disabled', false);

    var selection = this.rendEng.canvas.getActiveObject();
    var ele = selection.eleRef;
    if (ele instanceof Toe.Model.Neume) {
        this.showInfo("Selected: " + ele.name +
                     "<br/> Pitche(s): " +
                     $.map(ele.components, function(nc) { return nc.pname.toUpperCase() + nc.oct; }).join(", ")  + " <br/>System Number: " + ele.system.orderNumber);

        $('#btn_ungroup').toggleClass('disabled', false);
        // Setup the neume sub-controls if we selected an editable neume.
        if (ele.typeid == "punctum" || ele.typeid == "cavum" || ele.typeid == "virga") {
            this.insertEditNeumeSubControls();
            this.bindEditNeumeSubControls(ele);
            this.initializeEditNeumeSubControls(ele);
        }
    }
    else if (ele instanceof Toe.Model.Clef) {
        this.showInfo("Selected: " + ele.name + " <br/>System Number: " + ele.system.orderNumber);
        this.insertEditClefSubControls(ele);
        this.bindEditClefSubControls(ele);
    }
    else if (ele instanceof Toe.Model.Division) {
        this.showInfo("Selected: " + ele.type);
        this.insertEditDivisionSubControls();
        this.bindEditDivisionSubControls(ele);
    }
    else if (ele instanceof Toe.Model.Custos) {
        this.showInfo("Selected: Custos <br/> Pitch: " + ele.pname.toUpperCase() + ele.oct + " <br/>System Number: " + ele.system.orderNumber);
    }
    else if (ele instanceof Toe.Model.System) {
        this.showInfo("Selected: system #" + ele.orderNumber);
    }
    
}

Toe.View.SquareNoteInteraction.prototype.handleEventSelectionCleared = function(aObject) {
    this.hideInfo();
    this.removeEditSubControls();
    $('#btn_delete').toggleClass('disabled', true);
    $('#btn_duplicate').toggleClass('disabled', true);
    $('#group_shape').prop('disabled', true);
    $('#btn_ungroup').toggleClass('disabled', true);
    $('#btn_mergesystems').toggleClass('disabled', true);
}

Toe.View.SquareNoteInteraction.prototype.handleEventSelectionCreated = function(aObject) {
    var selection = aObject.target;
    selection.hasControls = false;
    selection.borderColor = 'red';
    // disable/enable buttons
    var toNeumify = 0;
    var toUngroup = 0;
    var toMerge = 0;
    var sModel = null;

    // Setting the correct variables for which UI to enable
    $.each(selection.getObjects(), function (oInd, o) {
        // don't draw a selection border around each object in the selection
        o.borderColor = 'rgba(0,0,0,0)';

        if (o.eleRef instanceof Toe.Model.Neume) {
            if (!sModel) {
                sModel = o.eleRef.system;
            }
            
            toUngroup++;

            if (o.eleRef.system == sModel) {
                toNeumify++;
            }
        }

        if (o.eleRef instanceof Toe.Model.System) {
            toMerge++;
        }
    });

    $('#btn_delete').toggleClass('disabled', false);
    $('#btn_duplicate').toggleClass('disabled', false);

    // UI code for grouping
    if (toNeumify < 2) {
        $("#menu_editpunctum").remove();
    }
    else {
        if ($("#menu_editpunctum").length == 0) {
            $("#sidebar-edit").append('<span id="menu_editpunctum"><select name="group_shape" id="group_shape">' +
                '<option value="null" selected="selected"> Select Grouping </option>\n' +
                '<option id="group_distropha" value="Distropha">Distropha</option>\n' +
                '<option id="group_tristopha" value="Tristropha">Tristropha</option>\n' +
                '<option id="group_clivis" value="Clivis">Clivis</option>\n' +
                '<option id="group_cephalicus" value="Cephalicus">Cephalicus</option>\n' +
                '<option id="group_climacus" value="Climacus">Climacus</option>\n' +
                '<option id="group_climacus_resupinus" value="Climacus Resupinus">Climacus Resupinus</option>\n' +
                '<option id="group_podatus" value="Podatus">Podatus</option>\n' +
                '<option id="group_podatus_subpunctis" value="Podatus Subpunctis">Podatus Subpunctis</option>\n' +
                '<option id="group_podatus_subpunctis_resupinus" value="Podatus Subpunctis Resupinus">Podatus Subpunctis Resupinus</option>\n' +
                '<option id="group_epiphonus" value="Epiphonus">Epiphonus</option>\n' +
                '<option id="group_scandicus" value="Scandicus">Scandicus</option>\n' +
                '<option id="group_scandicus_flexus" value="Scandicus Flexus">Scandicus Flexus</option>\n' +
                '<option id="group_scandicus_subpunctis" value="Scandicus Subpunctis">Scandicus Subpunctis</option>\n' +
                '<option id="group_torculus" value="Torculus">Torculus</option>\n' +
                '<option id="group_torculus_respinus" value="Torculus Resupinus">Torculus Resupinus</option>\n' +
                '<option id="group_porrectus" value="Porrectus">Porrectus</option>\n' +
                '<option id="group_porrectus_flexus" value="Porrectus Flexus">Porrectus Flexus</option>\n' +
                '<option id="group_porrectus_subpunctis" value="Porrectus Subpunctis">Porrectus Subpunctis</option>\n' +
                '<option id="group_porrectus_subpunctis_resupinus" value="Porrectus Subpunctis Resupinus">Porrectus Subpunctis Resupinus</option>\n' +
                '<option id="group_compound" value="Compound">Compound</option></select></span>');
        }

        $("#group_shape").bind("change", {gui: this, modifier: ""}, this.handleNeumify);
    }

    // UI code activation for ungropuing
    if (toUngroup > 0) {
        $('#btn_ungroup').toggleClass('disabled', false);
    }
    else {
        $('#btn_ungroup').toggleClass('disabled', true);
    }

    // UI Code for merge systems
    if (toMerge == 2) {
        $('#btn_mergesystems').toggleClass('disabled', false);
    }
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GUI Management Methods
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
Toe.View.SquareNoteInteraction.prototype.getOutputBoundingBox = function(bb) {
    gui = this;
    return $.map(bb, function(b) {
        return Math.round(b/gui.page.scale);
    });
}

Toe.View.SquareNoteInteraction.prototype.getLowScaleBoundingBox = function(bb) {
    gui = this;
    //The formula is as follows as ulx as an example:
    // ( (obj.ulx / xFactor) + scaling.ulx ) / page.scale
    var ulx = Math.round(( (bb[0]/gui.scaling[4]) + gui.scaling[0] ) / gui.pageScale);
    var uly = Math.round(( (bb[1]/gui.scaling[5]) + gui.scaling[1] ) / gui.pageScale);
    var lrx = Math.round(( (bb[2]/gui.scaling[4]) + gui.scaling[0] ) / gui.pageScale);
    var lry = Math.round(( (bb[3]/gui.scaling[5]) + gui.scaling[1] ) / gui.pageScale);
    return [ulx, uly, lrx, lry];
}

Toe.View.SquareNoteInteraction.prototype.bindHotKeys = function() {
    var gui = this;

    // delete hotkey
    Mousetrap.bind(['del', 'backspace'], function() {
        $("#btn_delete").trigger('click.edit', {gui:gui}, gui.handleDelete);
        return false;
    });

    Mousetrap.bind(['g'], function() {
        $("#btn_quickgroup").trigger('click.edit', {gui:gui, modifier: ""}, gui.handleQuickNeumify);
        return false;
    });

    Mousetrap.bind(['u'], function() {
        $("#btn_ungroup").trigger('click.edit', {gui:gui}, gui.handleUngroup);
        return false;
    });

    Mousetrap.bind(['m'], function() {
        $("#btn_mergesystems").trigger('click.edit', {gui:gui}, gui.handleMergeSystems);
        return false;
    });

    Mousetrap.bind(['meta+a'], function() {
        $("#btn_selectall").trigger("click.edit", {gui: gui}, gui.handleSelectAll);
        return false;
    });

    Mousetrap.bind(['n'], function() {
        $("#rad_punctum").click();
        return false;
    });

    Mousetrap.bind(['d'], function() {
        $("#rad_division").click();
        return false;
    });

    Mousetrap.bind(['s'], function() {
        $("#rad_system").click();
        return false;
    });

    Mousetrap.bind(['z'], function() {
        $("#btn_zoom").click();
        return false;
    });

    Mousetrap.bind(['c'], function() {
        $("#rad_clef").click();
        $("#rad_clef").trigger('click.insert', {gui:gui}, gui.handleInsertClef);
        $("#edit_rad_c").click();
        $("#rad_doh").click();
        return false;
    });

    Mousetrap.bind(['meta+z'], function() {
        $("#btn_undo").trigger('click.edit', {gui:gui}, gui.handleUndo);
        return false;
    });

    Mousetrap.bind(['f'], function() {
        $("#edit_rad_f").click();
        $("#rad_fah").click();
        return false;
    });

    Mousetrap.bind(['l'], function() {
        $("#btn_stafflock").click();
        return false;
    });

    Mousetrap.bind(['meta+r'], function() {
        $("#btn_refresh").click();
        return false;
    });


    // Hotkeys for moving objects
    Mousetrap.bind(['up'], function () {
        gui.handleArrowKeys("up");
        return false;
    });

    Mousetrap.bind(['down'], function () {
        gui.handleArrowKeys("down");
        return false;
    });

    Mousetrap.bind(['tab'], function() {
        if($("#btn_insert").hasClass("active")){
            $("#btn_edit").click();
        }
        else {
            $("#btn_insert").click();
        }

        return false;
    })
}

Toe.View.SquareNoteInteraction.prototype.bindAlerts = function () {
    $('#closealert').click($.proxy(function () {
        this.hideAlert();
    }, this))

    $('#closeinfo').click($.proxy(function () {
        this.hideInfo();
    }, this))
}

Toe.View.SquareNoteInteraction.prototype.insertEditControls = function(aParentDivId) {
    // add buttons for edit commands
    if ($("#sidebar-edit").length === 0) {
        $(aParentDivId).append('<span id="sidebar-edit"><br/><li class="divider"></li><li class="nav-header">Edit</li>\n' +
                                '<li><button title="Ungroup the selected neume combination" id="btn_ungroup" class="btn"><i class="icon-share"></i> Ungroup</button>' +
                                '<button title="Merge systems (if one is empty)" id="btn_mergesystems" class="btn"></i> Merge Systems</button></li>\n' +
                                '<li><button title="Group" id="btn_quickgroup" class="hide" >Group</button>' +
                                // duplicate is unfinished functionality. Uncomment and refer to handleDuplicate() to continue working on it.
                                // '<li><button title="Duplicate" id="btn_duplicate" class="btn"> Duplicate</button>' +
                                '<li><button title="Delete the selected neume" id="btn_delete" class="btn"><i class="icon-remove"></i> Delete</button>' +
                                '<button title="Undo" id="btn_undo" class="btn"> Undo</button></li>\n' +
                                '<li><button title="refresh canvas" id="btn_refresh" class="btn"> Refresh</button>' +
                                '<button title="Select all elements on the page" id="btn_selectall" class="btn"> Select All</button></li>\n' +
                                '<li><button title="Zoom in and out of the canvas" id="btn_zoom" class="btn">Zoom</button></li></div>' +
                                '<p>Staff Lock  <input id="btn_stafflock" type="checkbox" checked/></p></span>');
    }

    // grey out edit buttons by default
    $('#btn_delete').toggleClass('disabled', true);
    $('#group_shape').prop('disabled', true);
    $('#btn_duplicate').toggleClass('disabled', true);
    $('#btn_ungroup').toggleClass('disabled', true);
    $('#btn_mergesystems').toggleClass('disabled', true);

}

Toe.View.SquareNoteInteraction.prototype.insertEditNeumeSubControls = function() {
    if ($("#menu_editpunctum").length == 0) {
        $("#sidebar-edit").append('<span id="menu_editpunctum"><br/><li class="nav-header">Change Neume Type</li>' +
                                  '<li><div class="btn-group"><a class="btn dropdown-toggle" data-toggle="dropdown">\n' +
                                  'Head shape <span class="caret"></span></a><ul class="dropdown-menu">\n' +
                                  '<li><a id="head_punctum">punctum</a></li>\n' +
                                  '<li><a id="head_punctum_inclinatum">punctum inclinatum</a></li>\n' +
                                  '<li><a id="head_punctum_inclinatum_parvum">punctum inclinatum parvum</a></li>\n' +
                                  '<li><a id="head_cavum">cavum</a></li>\n' +
                                  '<li><a id="head_virga">virga</a></li>\n' +
                                  '<li><a id="head_quilisma">quilisma</a></li></div>\n' +
                                  '<li class="nav-header">Ornamentation</li>\n' +
                                  '<li><div class="btn-group" data-toggle="buttons-checkbox">\n' +
                                  '<button id="edit_chk_dot" class="btn">&#149; Dot</button>\n' +
                                  '<button id="edit_chk_horizepisema" class="btn"><i class="icon-resize-horizontal"></i> Episema</button>\n' +
                                  '<button id="edit_chk_vertepisema" class="btn"><i class="icon-resize-vertical"></i> Episema</button>\n</div></li>\n' +
                                  '</ul></span>');
    }
}

Toe.View.SquareNoteInteraction.prototype.insertEditClefSubControls = function(aElement) {
    if ($("#menu_editclef").length == 0) {
            $("#sidebar-edit").append('<span id="menu_editclef"><br/><li class="nav-header">Clef</li>\n' +
                                      '<li><div class="btn-group" data-toggle="buttons-radio">\n' +
                                      '<button id="edit_rad_c" class="btn">C</button>\n' +
                                      '<button id="edit_rad_f" class="btn">F</button>\n</div></li></span>');
    }

    // activate appropriate radio button
    if (aElement.shape == "c") {
        $("#edit_rad_c").toggleClass("active", true);
    }
    else {
        $("#edit_rad_f").toggleClass("active", true);
    }
}

Toe.View.SquareNoteInteraction.prototype.insertEditDivisionSubControls = function() {
    if ($("#menu_editdivision").length == 0) {
        $("#sidebar-edit").append('<span id="menu_editdivision"><br/><li class="nav-header">Division Type</li>\n' +
            '<li><div class="btn-group" data-toggle="buttons-radio">\n' +
            '<button id="edit_div_small" class="btn"> Small</button>\n' +
            '<button id="edit_div_minor" class="btn"> Minor</button>\n' +
            '<button id="edit_div_major" class="btn"> Major</button>\n' +
            '<button id="edit_div_final" class="btn"> Final</button></div></li></span>');
    }
}

Toe.View.SquareNoteInteraction.prototype.insertInsertControls = function(aParentDivId) {
    if ($("#sidebar-insert").length == 0) {
        $(aParentDivId).append('<span id="sidebar-insert"><br/><li class="divider"></li><li class="nav-header">Insert</li>\n' +
                              '<li><div class="btn-group" data-toggle="buttons-radio">' +
                              '<button id="rad_punctum" class="btn"><b>■</b> Neume</button>\n' +
                              '<button id="rad_division" class="btn"><b>||</b> Division</button>\n' + 
                              '<button id="rad_system" class="btn"><b><i class="icon-align-justify icon-black"></i></b>System</button>\n' + 
                              '<button id="rad_clef" class="btn"><b>C/F</b> Clef</button>\n</div>\n</li>\n</span>');
    }
    $("#rad_punctum").bind("click.insert", {gui: this}, this.handleInsertPunctum);
    $("#rad_division").bind("click.insert", {gui: this}, this.handleInsertDivision);
    $("#rad_system").bind("click.insert", {gui: this}, this.handleInsertSystem);
    $("#rad_clef").bind("click.insert", {gui: this}, this.handleInsertClef);
    $("#rad_punctum").trigger('click');
}

Toe.View.SquareNoteInteraction.prototype.unbindEditClefSubControls = function() {
    $("#edit_rad_c").unbind("click");
    $("#edit_rad_f").unbind("click");
}

Toe.View.SquareNoteInteraction.prototype.bindEditClefSubControls = function(aElement) {
    $("#edit_rad_c").bind("click.edit", {gui: this, clef: aElement, shape: "c"}, this.handleClefShapeChange);
    $("#edit_rad_f").bind("click.edit", {gui: this, clef: aElement, shape: "f"}, this.handleClefShapeChange);
}

Toe.View.SquareNoteInteraction.prototype.unbindEditNeumeSubControls = function() {
    $("#edit_chk_dot").unbind("click");
    $("#edit_chk_horizepisema").unbind("click");
    $("#edit_chk_vertepisema").unbind("click");
    $("#head_punctum").unbind("click");
    $("#head_cavum").unbind("click");
    $("#head_virga").unbind("click");
    $("#head_quilisma").unbind("click");
    $("#head_punctum_inclinatum").unbind("click");
    $("#head_punctum_inclinatum_parvum").unbind("click");
}

Toe.View.SquareNoteInteraction.prototype.unbindEditSubControls = function() {

    // Neume sub-controls.
    $("#edit_chk_dot").unbind("click");
    $("#edit_chk_horizepisema").unbind("click");
    $("#edit_chk_vertepisema").unbind("click");
    $("#head_punctum").unbind("click");
    $("#head_cavum").unbind("click");
    $("#head_virga").unbind("click");
    $("#head_quilisma").unbind("click");
    $("#head_punctum_inclinatum").unbind("click");
    $("#head_punctum_inclinatum_parvum").unbind("click");

    // Clef sub-controls.
    $("#edit_rad_c").unbind("click");
    $("#edit_rad_f").unbind("click");
}

Toe.View.SquareNoteInteraction.prototype.bindEditNeumeSubControls = function(aElement) {
    $("#head_punctum").bind("click.edit", {gui: this, punctum: aElement, shape: "punctum"}, this.handleHeadShapeChange);
    $("#head_cavum").bind("click.edit", {gui: this, punctum: aElement, shape: "cavum"}, this.handleHeadShapeChange);
    $("#head_virga").bind("click.edit", {gui: this, punctum: aElement, shape: "virga"}, this.handleHeadShapeChange);
    $("#head_quilisma").bind("click.edit", {gui: this, punctum: aElement, shape: "quilisma"}, this.handleHeadShapeChange);
    $("#head_punctum_inclinatum").bind("click.edit", {gui: this, punctum: aElement, shape: "punctum_inclinatum"}, this.handleHeadShapeChange);
    $("#head_punctum_inclinatum_parvum").bind("click.edit", {gui: this, punctum: aElement, shape: "punctum_inclinatum_parvum"}, this.handleHeadShapeChange);
    $("#edit_chk_dot").bind("click.edit", {gui: this, punctum: aElement}, this.handleDotToggle);
    $("#edit_chk_horizepisema").bind("click.edit", {gui: this, punctum: aElement}, this.handleHorizEpisemaToggle);
    $("#edit_chk_vertepisema").bind("click.edit", {gui: this, punctum: aElement}, this.handleVertEpisemaToggle);
}

Toe.View.SquareNoteInteraction.prototype.initializeEditNeumeSubControls = function(aElement) {
    var nc = aElement.components[0];
    var hasDot = nc.hasOrnament("dot");
    var hasEpisema = nc.hasOrnament("episema");
    var episemaForm = "null";

    var selection = this.rendEng.canvas.getActiveObject();

    if(hasEpisema){
        episemaForm = selection.eleRef.components[0].getOrnamentForm("episema");
    }
    if(hasEpisema && episemaForm == "horizontal"){
        $("#edit_chk_horizepisema").toggleClass("active", true);
    }
    else{
        $("#edit_chk_horizepisema").toggleClass("active", false);
    }
    if(hasEpisema && episemaForm == "vertical"){
        $("#edit_chk_vertepisema").toggleClass("active", true);
    }
    else{
        $("#edit_chk_vertepisema").toggleClass("active", false);
    }
    if (hasDot){
        $("#edit_chk_dot").toggleClass("active", true);
    }
    else {
        $("#edit_chk_dot").toggleClass("active", false);
    }
}

Toe.View.SquareNoteInteraction.prototype.bindEditDivisionSubControls = function(aElement) {
    $("#edit_div_small").bind("click.edit", {gui: this, division: aElement, type: "div_small"}, this.handleDivisionShapeChange);
    $("#edit_div_minor").bind("click.edit", {gui: this, division: aElement, type: "div_minor"}, this.handleDivisionShapeChange);
    $("#edit_div_major").bind("click.edit", {gui: this, division: aElement, type: "div_major"}, this.handleDivisionShapeChange);
    $("#edit_div_final").bind("click.edit", {gui: this, division: aElement, type: "div_final"}, this.handleDivisionShapeChange);

}

Toe.View.SquareNoteInteraction.prototype.removeInsertSubControls = function() {
    $("#menu_insertdivision").remove();
    $("#menu_insertclef").remove();
    $("#menu_insertpunctum").remove();
    $("#menu_insertsystem").remove();
    if (this.divisionDwg) {
        this.rendEng.canvas.remove(this.divisionDwg);
    }
    if (this.clefDwg) {
        this.rendEng.canvas.remove(this.clefDwg);
    }
    if (this.punctDwg) {
        this.rendEng.canvas.remove(this.punctDwg);
    }
    if (this.systemDrawing) {
        this.rendEng.canvas.remove(this.systemDrawing);
    }
}

Toe.View.SquareNoteInteraction.prototype.unbindInsertControls = function() {
    $("#rad_punctum").unbind("click");
    $("#rad_division").unbind("click");
    $("#rad_system").unbind("click");
    $("#rad_clef").unbind("click");
}

Toe.View.SquareNoteInteraction.prototype.removeEditSubControls = function () {
    $("#menu_editclef").remove();
    $("#menu_editpunctum").remove();
    $("#menu_editdivision").remove();
}

Toe.View.SquareNoteInteraction.prototype.unbindEditControls = function() {
    $("#btn_delete").unbind("click.edit");
    $("#btn_duplicate").unbind("click.edit");
    $("#group_shape").unbind("change");
}

Toe.View.SquareNoteInteraction.prototype.insertInsertSystemSubControls = function() {
    if ($("#menu_insertsystem").length == 0) {
        $("#sidebar-insert").append('<span id="menu_insertsystem"><br/>\n<li class="nav-header">System Number</li>\n' +
                                    '<p>Choose which system number to create. (Existing systems will be shifted upwards in number)</p>' +
                                    '<li><div><input id="system_number_slider" type="range" min="1" max="1" step="1" value="1">' +
                                    '<output id="system_number"></output></div></li></span>');
        $("#system_number_slider").change(function() {$('#system_number').html(this.value);}).change();
    }
}

Toe.View.SquareNoteInteraction.prototype.updateInsertSystemSubControls = function() {
    $("#system_number_slider").attr("max", this.page.systems.length + 1);
    $("#system_number_slider").val(this.page.systems.length + 1);
    $("#system_number_slider").change();
}
