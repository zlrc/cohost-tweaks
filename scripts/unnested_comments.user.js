// ==UserScript==
// @name         Unnested Comments for Cohost
// @namespace    https://zirc.thebunny.net
// @version      0.1
// @description  Chains comments after one level of nesting to improve readability.
// @author       ZiRC
// @match        https://cohost.org/*/post/*
// ==/UserScript==

const style = document.createElement("style");
style.innerText = `
    .uc-reply-quote {
        text-overflow: ellipsis;
        overflow-x: clip;
        white-space: nowrap;
        padding-left: 1em;
        border-left-width: 0.25rem;
    }
    .uc-vertical-line__wrapper {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .uc-vertical-line {
        background: rgb(160 156 152 / var(--tw-border-opacity));
        width: 1px;
        height: 100%;
        margin-left: auto;
        margin-right: auto;
    }
`;
document.head.appendChild(style);

function styleComment(comment, lastInChain, parentData = null) {
    if (!lastInChain) {
        // Add a line to the left side
        const line = document.createElement("div");
        const wrapper = document.createElement("div");
        let avatar = comment.querySelector("div > div > a");
        if (!avatar) {
            avatar = comment.querySelector("div > div"); // for deleted / hidden comments
        }
        line.classList.add("uc-vertical-line");
        wrapper.classList.add("uc-vertical-line__wrapper");
        avatar.parentElement.insertBefore(wrapper, avatar);
        wrapper.appendChild(avatar);
        wrapper.appendChild(line);
    }
    if (parentData) {
        // Add a quote and link to the comment it's replying to
        const contents = comment.querySelector(".prose");
        const quote = document.createElement("blockquote");
        let truncatedHandle = parentData.handle;
        if (truncatedHandle.length > 20) {
            truncatedHandle = truncatedHandle.substring(0, 17) + "...";
        }
        quote.classList.add("uc-reply-quote");
        quote.innerHTML = `
            <span class="text-gray-500">
                <a class="hover:underline" href="https://cohost.org/${parentData.handle}"><b>@${truncatedHandle}</b></a>: <a class="hover:underline" href="#comment-${parentData.id}">${parentData.text}</a>
            </span>
        `;
        contents.parentElement.insertBefore(quote, contents);
    }
}

function extractCommentData(comment) {
    const id = comment.getAttribute("data-comment-id");
    try {
        const handle = comment.querySelector("div > div > a").getAttribute("title").substring(1);
        let text = comment.querySelector(".prose").innerText;
        if (text.length > 80) {
            text = text.substring(0, 77) + "...";
        }
        return {handle, id, text};
    } catch {
        return {handle: "", id, text: "[deleted]"};
    }
}

function formatReplies(container, parentData = null, ancestorIsLastReply = true) {
    const replies = [];
    const topLevelReplies = container.querySelectorAll(":scope > div > article[data-comment-id]");
    topLevelReplies.forEach((topLevelReply, index) => {
        // Check if the top-level reply has replies, and recursively format them.
        const nextLevelContainer = topLevelReply.nextElementSibling;
        const isLastReply = !parentData || (ancestorIsLastReply && (index === topLevelReplies.length - 1));
        let nestedReplies = []
        if (nextLevelContainer) {
            nestedReplies = formatReplies(nextLevelContainer, extractCommentData(topLevelReply), isLastReply);
        }
        // Style the top-level reply, subsequent top-level replies need to quote the parent.
        styleComment(topLevelReply, !nextLevelContainer && isLastReply, index == 0 ? null : parentData);
        replies.push(topLevelReply, ...nestedReplies);
        topLevelReply.parentElement.remove();
    });
    return replies;
}

function update() {
    console.log("update");
    document.querySelectorAll(".my-3 > div > div > article[data-comment-id]").forEach(topLevelComment => {
            const repliesContainer = topLevelComment.nextElementSibling;
            if (repliesContainer) {
                const children = formatReplies(repliesContainer);
                children.forEach(child => {
                    repliesContainer.appendChild(child);
                });
            }
        });
}

/* Start Here */
(function () {
    'use strict';

    const observer = new MutationObserver(_mutations => {
        console.log("mutation observed");
        update()
    });

    update();
    observer.observe(document.body, { subtree: true, childList: true });
})();
