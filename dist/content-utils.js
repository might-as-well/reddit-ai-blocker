"use strict";
var AiBlockerContentUtils;
(function (AiBlockerContentUtils) {
    function toKeywordList(value) {
        if (!Array.isArray(value))
            return [];
        return value.map((item) => String(item).toLowerCase());
    }
    AiBlockerContentUtils.toKeywordList = toKeywordList;
    function normalize(text) {
        return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
    }
    AiBlockerContentUtils.normalize = normalize;
    function hashText(input) {
        const text = String(input || "");
        let hash = 5381;
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 33) ^ text.charCodeAt(i);
        }
        return (hash >>> 0).toString(36);
    }
    AiBlockerContentUtils.hashText = hashText;
    function getPermalinkPostIdFromPath() {
        const match = window.location.pathname.match(/\/comments\/([a-z0-9]+)\b/i);
        if (!match?.[1])
            return null;
        return `t3_${match[1].toLowerCase()}`;
    }
    AiBlockerContentUtils.getPermalinkPostIdFromPath = getPermalinkPostIdFromPath;
    function getElementPostId(postEl) {
        const htmlPost = postEl;
        const candidates = [
            htmlPost.dataset.postId,
            htmlPost.getAttribute("post-id"),
            htmlPost.getAttribute("id"),
            htmlPost.getAttribute("data-fullname"),
        ];
        const raw = candidates.find((value) => typeof value === "string" && value.length > 0);
        if (!raw)
            return null;
        const normalized = raw.toLowerCase();
        if (normalized.startsWith("t3_"))
            return normalized;
        return null;
    }
    AiBlockerContentUtils.getElementPostId = getElementPostId;
    function isPrimaryPermalinkPost(postEl) {
        const permalinkPostId = getPermalinkPostIdFromPath();
        if (!permalinkPostId)
            return false;
        const elementPostId = getElementPostId(postEl);
        return elementPostId === permalinkPostId;
    }
    AiBlockerContentUtils.isPrimaryPermalinkPost = isPrimaryPermalinkPost;
    function getPostText(postEl) {
        const title = postEl.querySelector("h1, h2, h3, [slot='title']")?.textContent || "";
        const body = postEl.textContent || "";
        const richBody = postEl.innerText || body;
        const raw = `${title}\n${richBody}`.trim();
        return { raw, normalized: normalize(raw) };
    }
    AiBlockerContentUtils.getPostText = getPostText;
    function countDomListItems(postEl) {
        return postEl.querySelectorAll("ul li, ol li").length;
    }
    AiBlockerContentUtils.countDomListItems = countDomListItems;
})(AiBlockerContentUtils || (AiBlockerContentUtils = {}));
