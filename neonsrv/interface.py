import json
import mimetypes
import os
import shutil

from pymei import XmlImport, XmlExport

import tornado.web

import conf

class RootHandler(tornado.web.RequestHandler):
    def get_files(self, document_type):
        if(document_type != "cheironomic"):
            root_dir = os.path.abspath(conf.MEI_DIRECTORY)
            mei_dir = os.path.join(root_dir, document_type)

            # only list mei files (not jpeg)
            meiFiles = []
            for f in os.listdir(mei_dir):
                if f.endswith(".mei"):
                    meiFiles.append(f)
            return meiFiles

    def get_document_types(self):
        mei_dir = os.path.abspath(conf.MEI_DIRECTORY)
        
        # list subdirectories in the mei root directory
        return os.walk(mei_dir).next()[1] 

    def get(self, url):
        #default and permissions are set in server.py
        url = url or self.settings["default"]

        #if page "doesn't exist", real 404
        if url not in self.settings["visible_pages"]:
            raise tornado.web.HTTPError(404)

        #else, page handlers
        elif url == "index.html":
            self.render(url, 
                    rootfiles=self.get_files(''),
                    document_types=self.get_document_types(),
                    errors="", 
                    prefix=conf.get_prefix())

        elif url == "demo.html":
            self.render(url, 
                    squarenotefiles=self.get_files('squarenote'), 
                    # stafflessfiles=self.get_files('cheironomic'),
                    document_types=self.get_document_types(),
                    errors="", 
                    prefix=conf.get_prefix())

    def post(self, request):
        mei = self.request.files.get("mei", [])
        mei_img = self.request.files.get("mei_img", [])
        document_type = "squarenote"
        mei_root_directory = os.path.abspath(conf.MEI_DIRECTORY)
        mei_directory = os.path.join(mei_root_directory, document_type)
        mei_directory_backup = os.path.join(mei_root_directory, "backup")
        errors = ""
        mei_fn = ""
        if len(mei):
            mei_fn = mei[0]["filename"]
            mei_fn_split = os.path.splitext(mei_fn)
            mei_zero, mei_ext = mei_fn_split
            contents = mei[0]["body"]
            # TODO: Figure out how to validate MEI files properly using pymei
            try:
                mei = XmlImport.documentFromText(contents)
            # if not mei_fn.endswith('.mei'):
            #     errors = "not in mei file format"
                if os.path.exists(os.path.join(mei_directory, mei_fn)):
                    errors = "mei file already exists"
                else:
                    # write to working directory and backup
                    fp = open(os.path.join(mei_directory, mei_fn), "w")
                    fp.write(contents)
                    fp.close()
                    fp = open(os.path.join(mei_directory_backup, mei_fn), "w")
                    fp.write(contents)
                    fp.close()

            except Exception, e:
                errors = "invalid mei file"

        if len(mei_img):
            # derive image filename from mei filename
            if mei_fn != "":
                img_fn = os.path.splitext(mei_fn)[0] + ".jpg"
            else:
                img_fn = mei_img[0]["filename"]
            img_contents = mei_img[0]["body"]
            try:
                if os.path.exists(os.path.join(mei_directory, img_fn)):
                    errors += "image file already exists"
                else:
                    fp = open(os.path.join(mei_directory, img_fn), "w")
                    fp.write(img_contents)
                    fp.close()
            except Exception, e:
                errors += "invalid image file"

        self.render("demo.html",
                    squarenotefiles=self.get_files('squarenote'), 
                    # stafflessfiles=self.get_files('cheironomic'),
                    document_types=self.get_document_types(),
                    errors=errors, 
                    prefix=conf.get_prefix())

class SquareNoteEditorHandler(tornado.web.RequestHandler):
    def get(self, page):
        debug = self.get_argument("debug", None)
        if debug:
            dstr = "true"
        else:
            dstr = "false"
        page = page[:page.rfind(".")]
        imagepath = conf.PROD_IMAGE_PATH.replace("PAGE", page)
        self.render(conf.get_neonHtmlFileName(square=True), page=page, debug=dstr, prefix=conf.get_prefix(), imagepath=imagepath)

class DeleteUndosHandler(tornado.web.RequestHandler):
    def post(self, documentType, filename):

        mei_directory = os.path.join(os.path.abspath(conf.MEI_DIRECTORY), documentType)
        meiworking = os.path.join(mei_directory, filename + ".mei")
        mei_directory_undo = os.path.join(conf.MEI_DIRECTORY, "undo")

        file_list = [f for f in os.listdir(mei_directory_undo)
                     if os.path.isfile(os.path.join(mei_directory_undo, f))]

        if len(file_list) != 0:
            for f in file_list:
                os.remove(mei_directory_undo + "/" + f)

        file_list = [f for f in os.listdir(mei_directory_undo)
                     if os.path.isfile(os.path.join(mei_directory_undo, f))]

        if len(file_list) == 0:
            meiundo = os.path.join(mei_directory_undo, filename + "_0" + str(1) + ".mei")

            if meiundo:
                shutil.copy(meiworking, meiundo)

class StafflessEditorHandler(tornado.web.RequestHandler):
    def get(self, page):
        debug = self.get_argument("debug", None)
        if debug:
            dstr = "true"
        else:
            dstr = "false"
        page = page[:page.rfind(".")]
        imagepath = conf.PROD_IMAGE_PATH.replace("PAGE", page)
        self.render(conf.get_neonHtmlFileName(square=False), page=page, debug=dstr, prefix=conf.get_prefix(), imagepath=imagepath)

class FileHandler(tornado.web.RequestHandler):
    mimetypes.add_type("text/xml", ".mei")

    def get(self, filename):
        fullpath = os.path.join(conf.MEI_DIRECTORY, filename)
        if not os.path.exists(os.path.abspath(fullpath)):
            self.send_error(403)
        else:
            fp = open(fullpath, "r")
            response = fp.read()
            # derive mime type from file for generic serving
            self.set_header("Content-Type", mimetypes.guess_type(fullpath)[0]);
            self.write(response)

class DeleteFileHandler(tornado.web.RequestHandler):
    mimetypes.add_type("text/xml", ".mei")

    def post(self, filename):
        fullpath = os.path.join(conf.MEI_DIRECTORY + "/squarenote/", filename)
        if not os.path.exists(os.path.abspath(fullpath)):
            self.send_error(403)
        else:
            os.remove(fullpath)
            jpgPath, mei_extension = os.path.splitext(fullpath)
            os.remove(jpgPath + ".jpg")
            self.redirect('/')

class DemoFileHandler(tornado.web.RequestHandler):
    mimetypes.add_type("text/xml", ".mei")

    def get(self, documentType, filename):
        fullpath = os.path.join(conf.MEI_DIRECTORY, documentType, filename)
        if not os.path.exists(os.path.abspath(fullpath)):
            self.send_error(403)
        else:
            fp = open(fullpath, "r")
            response = fp.read()
            # derive mime type from file for generic serving
            self.set_header("Content-Type", mimetypes.guess_type(fullpath)[0]);
            self.write(response)

class FileRevertHandler(tornado.web.RequestHandler):
    def post(self, documentType, filename):
        '''
        Move the given filename from the backup directory to the
        working directory. Overwrites changes made by the editor!
        '''
        mei_directory = os.path.join(os.path.abspath(conf.MEI_DIRECTORY), documentType)
        meiworking = os.path.join(mei_directory, filename + ".mei")
        mei_directory_backup = os.path.join(conf.MEI_DIRECTORY, "backup")
        meibackup = os.path.join(mei_directory_backup, filename + ".mei")

        if meibackup:
            shutil.copy(meibackup, meiworking)

class FileUndoHandler(tornado.web.RequestHandler):
    def post(self, documentType, filename):
        '''
        Move the given filename from the undo directory to the
        working directory. Overwrites changes made by the editor!
        '''
        mei_directory = os.path.join(os.path.abspath(conf.MEI_DIRECTORY), documentType)
        meiworking = os.path.join(mei_directory, filename + ".mei")
        mei_directory_undo = os.path.join(conf.MEI_DIRECTORY, "undo")

        file_list = [f for f in os.listdir(mei_directory_undo)
                     if os.path.isfile(os.path.join(mei_directory_undo, f))]

        list_length = len(file_list)

        if list_length > 1:
            if list_length < 10:
                meicurrent = os.path.join(mei_directory_undo, filename + "_0" + str(list_length) + ".mei")
                meiundo = os.path.join(mei_directory_undo, filename + "_0" + str(list_length - 1) + ".mei")
            elif list_length == 10:
                meicurrent = os.path.join(mei_directory_undo, filename + "_" + str(list_length) + ".mei")
                meiundo = os.path.join(mei_directory_undo, filename + "_0" + str(list_length - 1) + ".mei")
            else:
                meicurrent = os.path.join(mei_directory_undo, filename + "_" + str(list_length) + ".mei")
                meiundo = os.path.join(mei_directory_undo, filename + "_" + str(list_length - 1) + ".mei")

            if meiundo:
                shutil.copy(meiundo, meiworking)

            os.remove(meicurrent)
