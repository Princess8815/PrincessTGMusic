// Replaces any %s with the arguments provided then returns the result
const strFormat = (str, ...args) => {
	return str.replace(/%s/g, () => args.shift());
};

// This was a pain to write but it should work fine and be well optimized.
const buildElemTree = (jsonTree) => {
    if (!jsonTree) throw new Error("TreeBuilder - No json tree, cannot proceed.");
    const finalTreeElem = document.createDocumentFragment();
    const buildQueue = Array.isArray(jsonTree[0]) ? [...jsonTree] : [jsonTree];
    let queueIndex = 0;
    while (queueIndex < buildQueue.length) {
        const branch = buildQueue[queueIndex++];
        if (!branch) continue;
        let props = null, data = null, children = null, hasProps = false;
        for (let i = 1, len = branch.length; i < len; i++) {
            const item = branch[i];
            if (Array.isArray(item)) children = item;
            else if (item && typeof item === "object") {
                if (!hasProps) { props = item; hasProps = true; }
                else data = item;
            }
        }
        const parentElem = branch._parent || finalTreeElem;
        const branchElem = props ? Object.assign(document.createElement(branch[0]), props) : document.createElement(branch[0]);
        if (data) Object.assign(branchElem.dataset, data);
        parentElem.appendChild(branchElem);
        const branchCount = children ? children.length : 0;
        for (let i = 0; i < branchCount; i++) {
            const child = children[i];
            if (child) {
                child._parent = branchElem;
                buildQueue.push(child);
            }
        }
    }
    return finalTreeElem;
};