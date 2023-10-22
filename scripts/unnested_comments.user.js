// ==UserScript==
// @name         Unnested Comments for Cohost
// @namespace    https://zirc.thebunny.net
// @copyright    Licensed under CC BY 4.0. To view a copy of this license, visit http://creativecommons.org/licenses/by/4.0/
// @version      1.0
// @description  Chains and collapses comments after one level of nesting to improve readability.
// @author       ZiRC (https://github.com/zlrc)
// @match        https://cohost.org/*/post/*
// ==/UserScript==

// HOW TO INSTALL (Desktop & Mobile):
// 1. Install a userscript manager on your preferred web browser (such as Tampermonkey: https://www.tampermonkey.net/).
// 2. Visit https://github.com/zlrc/cohost-tweaks/blob/main/scripts/unnested_comments.user.js
//    and click "Raw" at the top right of the code box.
// 3. In Tampermonkey, you can manually check for updates to this script by going to:
//    "Installed Userscripts" > "Edit" (pencil and paper icon) > "File" > "Check for updates"

const START_DEPTH = 1; // default: 1 (changing doesn't do anything useful yet)
const COLLAPSE_DEPTH = 1; // default: 1
const REPLY_DEPTH_LIMIT = 7; // default: 7

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

    .uc-collapse-summary {
        list-style-type: '';
        width: fit-content;
    }
    .uc-collapse-summary:hover::after {
        text-decoration-line: underline;
    }
    .uc-collapse-icon {
        text-align: center;
        font-size: 1.15rem;
    }

    details > .uc-collapse-summary::after {
        content: 'show more replies';
        margin-bottom: 0.75rem
    }
    details[open] > .uc-collapse-summary::after {
        content: 'show less replies';
        margin-bottom: 0rem;
    }
    details .uc-collapse-icon::after {
        content: '⊕'
    }
    details[open] .uc-collapse-icon::after {
        content: '⊝'
    }
`;
document.head.appendChild(style);


/**
 * Applies the necessary chain formatting to a single comment.
 * @param comment the comment (`<article>` element with a `data-comment-id` attribute)
 * @param lastInChain format this comment as if it's the last in a reply chain (boolean)
 * @param parentData info about the comment this is replying to, structured like so: `{handle : string, id : string, text : string}`
 */
function styleComment(comment, lastInChain, parentData = null, depth = -1) {
    if (!lastInChain || depth > START_DEPTH) { // (shallow threads are left unaltered)
        // Add a line to the left side.
        const line = document.createElement("div");
        const wrapper = document.createElement("div");

        let avatar = comment.querySelector("div > div > a");
        if (!avatar) {
            avatar = comment.querySelector("div > div"); // for deleted / hidden comments
        }

        line.classList.add("uc-vertical-line");
        wrapper.classList.add("uc-vertical-line__wrapper");
        avatar.parentElement.insertBefore(wrapper, avatar); // place wrapper above the avatar

        const avatarMobile = comment.querySelector("div > div > div > div > div.mask");
        if (avatarMobile) {
            wrapper.appendChild(avatarMobile); // moves avatar element into the wrapper
        }
        wrapper.appendChild(avatar); // moves avatar element into the wrapper
        wrapper.appendChild(line); // vertical line goes underneath the avatar

        if (lastInChain) {
            line.classList.add("hidden"); // hides the line, leaving only an indent
        }
    }
    const contents = comment.querySelector(".prose");
    if (parentData) {
        // Add a quote and link to the comment it's replying to.
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
        contents.parentElement.insertBefore(quote, contents); // places the quote above the comment's contents
    }

    if (depth >= REPLY_DEPTH_LIMIT) {
        // Disable the reply button when the chain is too deep to be readable without the userscript.
        const replyButton = contents.nextElementSibling.querySelector("button");
        if (!replyButton) return;
        replyButton.classList.remove("cursor-pointer", "hover:underline", "text-cherry");
        replyButton.classList.add("text-gray-400", "cursor-not-allowed");
        replyButton.setAttribute("title", "Disabled by 'Unnested Comments for Cohost': this comment is nested too far, those who don't have this userscript might not see your reply!");
        replyButton.setAttribute("disabled", "true");
        replyButton.lastChild.textContent = "can't reply further";
    }
}


/**
 * Parses user handle, comment id, and comment text.
 * @param comment the comment (\<article> element with a `data-comment-id` attribute)
 * @returns dictionary in the following format: `{handle : string, id : string, text : string}`
 */
function extractCommentData(comment) {
    const id = comment.getAttribute("data-comment-id");
    try {
        const handle = comment.querySelector("div > div > a").getAttribute("title").substring(1);
        let text = comment.querySelector(".prose").innerText;
        if (text.length > 80) {
            text = text.substring(0, 77) + "...";
        }
        return { handle, id, text };
    } catch {
        return { handle: "", id, text: "[deleted]" };
    }
}


/**
 * Recursively parses and formats a comment thread into an array of elements.
 * @param container the enclosing, unaltered `<div>` element containing all the replies
 * @param parentData info about the comment these are replying to, structured like so: `{handle : string, id : string, text : string}`
 * @param ancestorIsLastReply whether the parent would have been the end of the chain without its replies
 * @returns an array of reformatted `<article>` elements to iteratively append to a container
 */
function formatReplies(container, parentData = null, ancestorIsLastReply = true, depth = 1) {
    const replies = [];
    const topLevelReplies = container.querySelectorAll(":scope > div > article[data-comment-id]");
    topLevelReplies.forEach((topLevelReply, index) => {
        // Check if the top-level reply has replies, and recursively format them.
        const nextLevelContainer = topLevelReply.nextElementSibling; // contains replies to topLevelReply
        const isLastReply = depth <= START_DEPTH || (ancestorIsLastReply && (index === topLevelReplies.length - 1));
        let nestedReplies = []
        if (nextLevelContainer) { // if there are replies
            nestedReplies = formatReplies(nextLevelContainer, extractCommentData(topLevelReply), isLastReply, depth+1);
            if (depth == COLLAPSE_DEPTH) {
                // Wrap deeper replies inside a disclosure
                const collapseContainer = document.createElement("details");
                collapseContainer.style.display = "contents";
                collapseContainer.innerHTML = `
                    <summary class="uc-collapse-summary cursor-pointer flex flex-row text-sm font-bold text-gray-500"><div class="uc-collapse-icon w-8 lg:w-16"></div></summary>
                    <div class="uc-vertical-line-wrapper h-3 w-8 lg:w-16"><div class="uc-vertical-line"></div></div>
                `;
                nestedReplies.forEach(reply => collapseContainer.appendChild(reply));
                nestedReplies = [collapseContainer];
            }
        }
        // Style the top-level reply, subsequent top-level replies need to quote the parent.
        styleComment(topLevelReply, !nextLevelContainer && isLastReply, index == 0 ? null : parentData, depth);
        replies.push(topLevelReply, ...nestedReplies);
        topLevelReply.parentElement.remove(); // removes container from the DOM (the one with a left border)
    });
    return replies;
}


/**
 * If the url is linking to a hidden comment, then this function will open its parent disclosure (`<details>`).
 * @param href the anchor/hash of the comment to look for (string)
 */
function revealAnchor(href) {
    if (href.startsWith("#comment-")) {
        const el = document.querySelector(href);
        if (!!el.offsetParent) { return; } // is already visible (see: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent)
        el.closest("details").open = true;
        window.location.hash = href;
    }
}


/**
 * Goes through all the top-level comments and reformats their replies.
 */
function update() {
    document.querySelectorAll(".my-3 > div > div > article[data-comment-id]").forEach(topLevelComment => {
        const repliesContainer = topLevelComment.nextElementSibling; // contains all replies to the comment
        if (repliesContainer) { // if any replies exist
            const children = formatReplies(repliesContainer);
            children.forEach(child => {
                repliesContainer.appendChild(child);
            });
        }
    });
    if (window.location.hash) {
        revealAnchor(window.location.hash);
    }
}


/* Start Here */
(function () {
    'use strict';

    const observer = new MutationObserver(_mutations => {
        update()
    });

    update();
    addEventListener("hashchange", () => revealAnchor(window.location.hash));
    observer.observe(document.body, { subtree: true, childList: true });
})();
