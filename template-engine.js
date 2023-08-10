/**
Author: Justin DEKEYSER
Year: August 2023
License: Apache License, Version 2.0, January 2004, http://www.apache.org/licenses/

Version: 0.0.5b

This is the template engine source code. We might modify contracts and implementations at any moment.

Current state:
--------------
    - Hydratation and Rehydratation are implemented and functional on model example
    - Most redundant white spaces are removed (<pre> is not supported anymore)
    - blank string are removed when inside a {#} block

    - Stabilized. Waiting for bugs, improvements, or security breaches
*/
const HANDLED_EVENTS = (() => {
    let mapping = new Map()
    mapping.set("click", "handleClick")
    mapping.set("submit", "handleSubmit")
    mapping.set("change", "handleChange")
    return mapping
})()

const MAX_ALLOWED_DEPTH = 10

const OPENING_TOKEN = '{'
const CLOSING_TOKEN = '}'

const SECTION_MARKER = '#'
const IF_BLOCK_MARKER = '?'
const ELSE_BLOCK_MARKER = ':'
const TEXT_CONTENT_MARKER = '$'
const EVENT_MARKER = '%'
const PIPE_DELIMITER = '|'
const HARD_CODED_MARKER = '"'
const END_OF_BLOCK = '/'

const IDENTIFICATION_ATTRIBUTE = 'data-uuid'

const BLANK_PATTERN = /\s\s+/g


function generateTreeFromExpression(template, reservedUuids) {
    let root = {
        children: [],
        root: true
    }
    let elementUuids = new Set(reservedUuids)
    
    let cursor = 0
    let ancestorChain = [root]
    
    for(;cursor < template.length;) {
        if(ancestorChain.length >= MAX_ALLOWED_DEPTH)
            throw "Template is too deep"
        
        let openingIndex = template.indexOf(OPENING_TOKEN, cursor)
        let tree = ancestorChain.pop()
        
        if(openingIndex >= 0) {
            {
                if(cursor + 1 < openingIndex) {
                    let slice = template.substring(cursor, openingIndex).replace(BLANK_PATTERN, ' ');
                    emitSlice: {
                        if(slice === ' ') {
                            // Heuristic: do not emit spaces when they are inside a {#} block.
                            if(tree.elementUuid) {
                                break emitSlice
                            } else {
                                for(let N = ancestorChain.length; --N >= 0;) {
                                    if(ancestorChain[N].elementUuid) {
                                        break emitSlice
                                    }
                                }
                            }
                        }
                        tree.children.push({ slice })
                    }
                }
            }
            let closingIndex = template.indexOf(CLOSING_TOKEN, openingIndex)
            if(closingIndex == -1) {
                let estimatedLineNumber = 0
                for(let c of template.substring(0, openingIndex))
                    if(c == '\n') estimatedLineNumber += 1
                throw `No closing symbol found for opening block; around line ${estimatedLineNumber}`
            }
            
            let variable = template.substring(openingIndex+OPENING_TOKEN.length+1, closingIndex).trim()
            switch(template[openingIndex+OPENING_TOKEN.length]) {
                case SECTION_MARKER: {
                    let nextTree = {
                        section: true,
                        variable,
                        children: []
                    }
                    
                    if(!variable) {
                        let elementUuid; do {
                            elementUuid = 'uuid'+parseInt(Math.random() * 100_000_000)
                        } while(elementUuids.has(elementUuid))
                        elementUuids.add(elementUuid)
                        nextTree.elementUuid = elementUuid
                    }
                    
                    tree.children.push(nextTree)
                    ancestorChain.push(tree)
                    ancestorChain.push(nextTree)
                }; break;
                case IF_BLOCK_MARKER: {
                    let nextTree = {
                        positiveConditional: true,
                        variable,
                        children: []
                    }
                    tree.children.push(nextTree)
                    ancestorChain.push(tree)
                    ancestorChain.push(nextTree)
                }; break;
                case ELSE_BLOCK_MARKER: {
                    let nextTree = {
                        negativeConditional: true,
                        variable,
                        children: []
                    }
                    tree.children.push(nextTree)
                    ancestorChain.push(tree)
                    ancestorChain.push(nextTree)
                }; break;
                case EVENT_MARKER: {
                    tree.children.push({
                        event: true,
                        variable
                    })
                    ancestorChain.push(tree)
                }; break;
                case TEXT_CONTENT_MARKER: {
                    tree.children.push({
                        textContent: true,
                        variable
                    })
                    ancestorChain.push(tree)
                }; break;
                case END_OF_BLOCK:
                    break;
                default: {
                    let variable = template.substring(openingIndex+OPENING_TOKEN.length, closingIndex).trim() // rectify
                    let pipeIndex = variable.indexOf(PIPE_DELIMITER)
                    if(pipeIndex == -1) {
                        let estimatedLineNumber = 0
                        for(let c of template.substring(0, openingIndex))
                            if(c == '\n') estimatedLineNumber += 1
                        throw `No pipe delimiter found, though we reach the end of potential blocks; around line ${estimatedLineNumber}`
                    }
                    let pipe = variable.substring(pipeIndex+PIPE_DELIMITER.length, variable.length).trim()
                    variable = variable.substring(0, pipeIndex).trim()
                    
                    let leaf;
                    if(variable.startsWith(HARD_CODED_MARKER)) {
                        let value = variable.substring(1, variable.length).trim()
                        leaf = { value, pipe }
                    } else {
                        leaf = { variable, pipe }
                    }

                    tree.children.push(leaf)
                    ancestorChain.push(tree)
                }; break;
            }
            
            cursor = closingIndex + CLOSING_TOKEN.length
        } else {
            tree.children.push({
                slice: template.substring(cursor, template.length).replace(BLANK_PATTERN, ' ')
            })
            
            cursor = template.length // loop is over, so break is not required
        }
    }
    
    return root;
}


function* iterativeMake(treeNode, scope, elementUuid, childSequence) {
    if(!scope) yield ''
    let variable = treeNode.variable
    
    /* First case, the tree represents a simple slice */
    if(treeNode.slice != null) {
        yield treeNode.slice
    }
    /* Second family of cases, the tree is about some block */
    else if(treeNode.root) {
        for(let childNode of treeNode.children) {
            yield* iterativeMake(childNode, scope, elementUuid, childSequence)
        }
    } else if(treeNode.section) {
        if(!variable) {
            if(elementUuid)
                throw "Nested identification blocks are forbidden"
            
            elementUuid = treeNode.elementUuid
            let sequenceHash = childSequence.join("_")
            let identifier = `${elementUuid}-${sequenceHash}`
            
            yield ` ${IDENTIFICATION_ATTRIBUTE}="${identifier}" `

            for(let childNode of treeNode.children) {
                yield* iterativeMake(childNode, scope, elementUuid, childSequence)
            }
        } else if(Object.hasOwn(scope, variable)) {
            scope = scope[variable]
            if(scope) {
                if(typeof scope[Symbol.iterator] === 'function') {
                    childSequence.push(0)
                    for(let record of scope) {
                        for(let childNode of treeNode.children) {
                            yield* iterativeMake(childNode, record, elementUuid, childSequence)
                        }
                        childSequence[childSequence.length - 1] += 1
                    }
                    childSequence.pop()
                } else {
                    for(let childNode of treeNode.children) {
                        yield* iterativeMake(childNode, scope, elementUuid, childSequence)
                    }
                }
            }
        }
    } else if(treeNode.positiveConditional) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(!!scope[variable]) {
                if(!elementUuid) {
                    childSequence.push('t')
                }
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuid, childSequence)
                }
                if(!elementUuid) {
                    childSequence.pop()
                }
            }
        }
    } else if(treeNode.negativeConditional) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(!scope[variable]) {
                if(!elementUuid) {
                    childSequence.push('f')
                }
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuid, childSequence)
                }
                if(!elementUuid) {
                    childSequence.pop()
                }
            }
        }
    }
    /* In those cases, the tree always represents a side effect */
    else if(treeNode.event) {
        if(variable) {
            let attribute = HANDLED_EVENTS.get(variable)
            if(attribute && Object.hasOwn(scope, attribute)) {
                let handler = scope[attribute]
                
                let sequenceHash = childSequence.join("_")
                let identifier = `${elementUuid}-${sequenceHash}`
            
                yield [
                    identifier,
                    _ => _.addEventListener(variable, handler),
                    _ => _.removeEventListener(variable, handler)
                ]
            }
        }
    } else if(treeNode.textContent) {
        if(variable && Object.hasOwn(scope, variable) && scope[variable]) {
            let sequenceHash = childSequence.join("_")
            let identifier = `${elementUuid}-${sequenceHash}`
            
            let value = scope[variable] || ''
            yield [
                identifier,
                _ => (_.textContent = value),
                _ => (_.textContent = '')
            ]
        }
    } else if(treeNode.pipe) {
        let sequenceHash = childSequence.join("_")
        let identifier = `${elementUuid}-${sequenceHash}`
        let attributeName = treeNode.pipe
        if(attributeName === 'class') {
            let value = null;
            if(treeNode.value == null) {
                if(variable && Object.hasOwn(scope, variable) && scope[variable]) {
                    value = variable
                }
            } else {
                value = treeNode.value
            }
            if(value != null)
                yield [
                    identifier,
                    _ => _.classList.add(value),
                    _ => _.classList.remove(value)
                ]
        } else {
            let value = null
            if(treeNode.value == null) {
                if(variable && Object.hasOwn(scope, variable) && scope[variable]) {
                    value = scope[variable]
                }
            } else {
                value = treeNode.value
            }
            if(value != null)
                yield [
                    identifier,
                    _ => _.setAttribute(attributeName, value),
                    _ => _.removeAttribute(attributeName)
                ]
        }
    } else {
        throw "Kawabunga, we are on a node we cannot handle?"
    }
}


function compile(template, reservedUuids) {
    let root = generateTreeFromExpression(template)
    
    return function* Hydrate(domRoot, scope) {
        let sideEffects = new Map();
        
        /* hydratation not done yet */
        {
            let htmlFragments = []
            for(let item of iterativeMake(root, scope, undefined, [])) {
                if(typeof item === 'string') {
                    htmlFragments.push(item)
                } else {
                    let [identifier, sideEffect, cancelEffect] = item
                    if(! sideEffects.has(identifier)) {
                        sideEffects.set(identifier, [])
                    }
                    sideEffects.get(identifier).push({ sideEffect, cancelEffect })
                }
            }
            domRoot.innerHTML = htmlFragments.join("")
        }
        
        for(;;)
        {
            // Start of the loop, we know the DOM is ready
            // and sideEffects map is filled but not applied yet
            
            // STEP 1: Perform the side effects
            for(let [identifier, effects] of sideEffects) {
                let element = domRoot.querySelector(`*[${IDENTIFICATION_ATTRIBUTE}=${identifier}]`)
                for(let pair of effects) {
                    pair.sideEffect(element)
                    delete pair.sideEffect
                }
            }
            
            // STEP 2: yield nothing and wait for next scope to show up
            scope = yield
            
            // STEP 3: perform clean
            for(let [identifier, effects] of sideEffects) {
                let element = domRoot.querySelector(`*[${IDENTIFICATION_ATTRIBUTE}=${identifier}]`)
                do {
                    let effect = effects.pop()
                    if(effect) {
                        effect.cancelEffect(element)
                    } else {
                        break
                    }
                } while(true)
            }
            
            if(!scope) {
                // STEP 4b: when no scope, we stop
                break
            } else {
                // STEP 4: Iterate on the scope again,
                // populate the effects map again
                for(let item of iterativeMake(root, scope, undefined, [])) {
                    if(typeof item === 'string') {
                        continue
                    } else {
                        let [identifier, sideEffect, cancelEffect] = item
                        if(!sideEffects.has(identifier)) {
                            sideEffects.set(identifier, [])
                        }
                        sideEffects.get(identifier).push({ sideEffect, cancelEffect })
                    }
                }
            }
        }
    }
}


window['__COMPILER__'] = compile
export { compile }
