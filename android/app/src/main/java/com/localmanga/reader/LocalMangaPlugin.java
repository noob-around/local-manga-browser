package com.localmanga.reader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

@CapacitorPlugin(name = "LocalManga")
public class LocalMangaPlugin extends Plugin {
    private static final Pattern PAGE_NUMBER_PATTERN = Pattern.compile("(\\d+)");

    @PluginMethod
    public void pickComicRoot(PluginCall call) {
        Intent intent = directoryPickerIntent();
        startActivityForResult(call, intent, "pickComicRootResult");
    }

    @PluginMethod
    public void pickWorkspaceRoot(PluginCall call) {
        Intent intent = directoryPickerIntent();
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickWorkspaceRootResult");
    }

    @ActivityCallback
    private void pickComicRootResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("未选择漫画目录");
            return;
        }

        Uri uri = result.getData().getData();
        int flags = result.getData().getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        getContext().getContentResolver().takePersistableUriPermission(uri, flags);

        JSObject response = new JSObject();
        response.put("uri", uri.toString());
        response.put("name", getDisplayName(uri));
        call.resolve(response);
    }

    @ActivityCallback
    private void pickWorkspaceRootResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("未选择工作目录");
            return;
        }

        Uri uri = result.getData().getData();
        int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getContext().getContentResolver().takePersistableUriPermission(uri, flags);

        JSObject response = new JSObject();
        response.put("uri", uri.toString());
        response.put("name", getDisplayName(uri));
        call.resolve(response);
    }

    @PluginMethod
    public void scanComicRoot(PluginCall call) {
        String rootUri = call.getString("uri");
        if (rootUri == null || rootUri.trim().isEmpty()) {
            call.reject("请先选择漫画目录");
            return;
        }

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(rootUri));
        if (root == null || !root.exists() || !root.isDirectory()) {
            call.reject("漫画目录不可访问，请重新选择目录");
            return;
        }

        JSArray comics = new JSArray();
        DocumentFile[] children = root.listFiles();
        List<DocumentFile> folders = new ArrayList<>();
        for (DocumentFile child : children) {
            if (child.isDirectory()) folders.add(child);
        }
        sortFiles(folders);

        for (DocumentFile folder : folders) {
            List<DocumentFile> pages = getSortedPages(folder);
            if (pages.isEmpty()) continue;

            JSObject comic = new JSObject();
            String folderUri = folder.getUri().toString();
            comic.put("id", "manga-" + stableId(folderUri));
            comic.put("title", safeName(folder));
            comic.put("author", "Unknown");
            comic.put("circle", "LOCAL FOLDER");
            comic.put("language", "Unknown");
            comic.put("pages", pages.size() + "/" + pages.size() + "P");
            comic.put("size", "文件夹");
            comic.put("likes", 0);
            comic.put("addedAt", "");
            comic.put("rating", 0);
            comic.put("ratingCount", 0);
            comic.put("shelf", "downloaded");
            comic.put("favorite", false);
            comic.put("cover", "cover-one");
            comic.put("tags", new JSArray());

            JSObject source = new JSObject();
            source.put("type", "android-folder");
            source.put("rootUri", rootUri);
            source.put("folderUri", folderUri);
            source.put("coverUri", pages.get(0).getUri().toString());
            source.put("coverMimeType", pages.get(0).getType());
            source.put("pages", buildPageArray(pages));
            comic.put("source", source);
            comics.put(comic);
        }

        JSObject response = new JSObject();
        response.put("comics", comics);
        response.put("total", comics.length());
        call.resolve(response);
    }

    @PluginMethod
    public void listPages(PluginCall call) {
        String folderUri = call.getString("folderUri");
        if (folderUri == null || folderUri.trim().isEmpty()) {
            call.reject("缺少漫画文件夹 URI");
            return;
        }

        DocumentFile folder = DocumentFile.fromSingleUri(getContext(), Uri.parse(folderUri));
        if (folder == null || !folder.exists() || !folder.isDirectory()) {
            call.reject("漫画文件夹不可访问");
            return;
        }

        List<DocumentFile> pageFiles = getSortedPages(folder);
        JSArray pages = new JSArray();
        for (int i = 0; i < pageFiles.size(); i++) {
            DocumentFile file = pageFiles.get(i);
            JSObject page = new JSObject();
            page.put("index", i);
            page.put("pageNumber", pageNumber(file.getName(), i + 1));
            page.put("name", safeName(file));
            page.put("uri", file.getUri().toString());
            page.put("mimeType", file.getType());
            pages.put(page);
        }

        JSObject response = new JSObject();
        response.put("pages", pages);
        call.resolve(response);
    }

    @PluginMethod
    public void readPage(PluginCall call) {
        String pageUri = call.getString("uri");
        if (pageUri == null || pageUri.trim().isEmpty()) {
            call.reject("缺少页面 URI");
            return;
        }

        try (InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(pageUri))) {
            if (input == null) {
                call.reject("无法读取图片");
                return;
            }

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }

            String mimeType = call.getString("mimeType", "image/jpeg");
            String encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            JSObject response = new JSObject();
            response.put("dataUrl", "data:" + mimeType + ";base64," + encoded);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("读取图片失败：" + error.getMessage());
        }
    }

    @PluginMethod
    public void readWorkspaceState(PluginCall call) {
        String workspaceUri = call.getString("uri");
        if (workspaceUri == null || workspaceUri.trim().isEmpty()) {
            call.reject("缺少工作目录 URI");
            return;
        }

        DocumentFile workspace = DocumentFile.fromTreeUri(getContext(), Uri.parse(workspaceUri));
        if (workspace == null || !workspace.exists() || !workspace.isDirectory()) {
            call.reject("工作目录不可访问，请重新选择目录");
            return;
        }

        DocumentFile file = workspace.findFile("reader-state.json");
        JSObject response = new JSObject();
        if (file == null || !file.exists()) {
            response.put("value", JSONObject.NULL);
            call.resolve(response);
            return;
        }

        try (InputStream input = getContext().getContentResolver().openInputStream(file.getUri())) {
            if (input == null) {
                response.put("value", JSONObject.NULL);
                call.resolve(response);
                return;
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            response.put("value", output.toString(StandardCharsets.UTF_8.name()));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("读取工作目录状态失败：" + error.getMessage());
        }
    }

    @PluginMethod
    public void writeWorkspaceState(PluginCall call) {
        String workspaceUri = call.getString("uri");
        String value = call.getString("value");
        if (workspaceUri == null || workspaceUri.trim().isEmpty()) {
            call.reject("缺少工作目录 URI");
            return;
        }
        if (value == null) value = "{}";

        DocumentFile workspace = DocumentFile.fromTreeUri(getContext(), Uri.parse(workspaceUri));
        if (workspace == null || !workspace.exists() || !workspace.isDirectory()) {
            call.reject("工作目录不可访问，请重新选择目录");
            return;
        }

        DocumentFile file = workspace.findFile("reader-state.json");
        if (file == null || !file.exists()) {
            file = workspace.createFile("application/json", "reader-state.json");
        }
        if (file == null) {
            call.reject("无法在工作目录创建状态文件");
            return;
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(file.getUri(), "wt")) {
            if (output == null) {
                call.reject("无法写入工作目录状态文件");
                return;
            }
            output.write(value.getBytes(StandardCharsets.UTF_8));
            JSObject response = new JSObject();
            response.put("uri", file.getUri().toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("写入工作目录状态失败：" + error.getMessage());
        }
    }

    private List<DocumentFile> getSortedPages(DocumentFile folder) {
        List<DocumentFile> pages = new ArrayList<>();
        for (DocumentFile file : folder.listFiles()) {
            if (file.isFile() && isImageFile(file)) pages.add(file);
        }
        pages.sort(Comparator
                .comparingInt((DocumentFile file) -> pageNumber(file.getName(), Integer.MAX_VALUE))
                .thenComparing(file -> safeName(file), Collator.getInstance(Locale.CHINA)));
        return pages;
    }

    private JSArray buildPageArray(List<DocumentFile> pageFiles) {
        JSArray pages = new JSArray();
        for (int i = 0; i < pageFiles.size(); i++) {
            DocumentFile file = pageFiles.get(i);
            JSObject page = new JSObject();
            page.put("index", i);
            page.put("pageNumber", pageNumber(file.getName(), i + 1));
            page.put("name", safeName(file));
            page.put("uri", file.getUri().toString());
            page.put("mimeType", file.getType());
            pages.put(page);
        }
        return pages;
    }

    private void sortFiles(List<DocumentFile> files) {
        files.sort(Comparator.comparing(this::safeName, Collator.getInstance(Locale.CHINA)));
    }

    private boolean isImageFile(DocumentFile file) {
        String type = file.getType();
        if (type != null && type.startsWith("image/")) return true;
        String name = safeName(file).toLowerCase(Locale.ROOT);
        return name.endsWith(".jpg")
                || name.endsWith(".jpeg")
                || name.endsWith(".png")
                || name.endsWith(".gif")
                || name.endsWith(".webp")
                || name.endsWith(".bmp")
                || name.endsWith(".avif");
    }

    private int pageNumber(String name, int fallback) {
        if (name == null) return fallback;
        Matcher matcher = PAGE_NUMBER_PATTERN.matcher(name);
        int last = fallback;
        while (matcher.find()) {
            try {
                last = Integer.parseInt(matcher.group(1));
            } catch (NumberFormatException ignored) {
                last = fallback;
            }
        }
        return last;
    }

    private String safeName(DocumentFile file) {
        String name = file.getName();
        return name == null ? "" : name;
    }

    private String getDisplayName(Uri uri) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
        }
        return uri.getLastPathSegment();
    }

    private Intent directoryPickerIntent() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        return intent;
    }

    private String stableId(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                builder.append(String.format("%02x", bytes[i]));
            }
            return builder.toString();
        } catch (Exception error) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
