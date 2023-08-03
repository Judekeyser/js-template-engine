/**
Author: Justin DEKEYSER
Year: August 2023
License: Apache License, Version 2.0, January 2004, http://www.apache.org/licenses/

Version: 0.0.0b

This is the template engine source code. We might modify contracts and implementations at any moment.
*/
const HANDLED_EVENTS = (() => {
    let mapping = new Map()
    mapping.set("click", "handleClick")
    mapping.set("submit", "handleSubmit")
    mapping.set("change", "handleChange")
    return mapping
})()

const MAX_ALLOWED_DEPTH = 10

const OPENING_TOKEN = '{{'
const CLOSING_TOKEN = '}}'

const SECTION_MARKER = '#'
const EMPTY_SECTION_MARKER = '^'
const IF_BLOCK_MARKER = '?'
const ELSE_BLOCK_MARKER = ':'
const TEXT_CONTENT_MARKER = '§'
const EVENT_MARKER = '%'
const PIPE_DELIMITER = '|'
const END_OF_BLOCK = '/'

const IDENTIFICATION_ATTRIBUTE = 'data-uuid'


function generateTreeFromExpression(template) {
    let root = {
        children: [],
        root: true
    }
    let elementUuids = new Set()
    
    let cursor = 0
    let ancestorChain = [root]
    
    for(;cursor < template.length;) {
        if(ancestorChain.length >= MAX_ALLOWED_DEPTH)
            throw "Template is too deep"
        
        let openingIndex = template.indexOf(OPENING_TOKEN, cursor)
        let tree = ancestorChain.pop()
        
        if(openingIndex >= 0) {
            tree.children.push({
                slice: template.substring(cursor, openingIndex)
            })
            let closingIndex = template.indexOf(CLOSING_TOKEN, cursor)
            if(closingIndex == -1) throw "Malformed template"
            
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
                case EMPTY_SECTION_MARKER: {
                    let nextTree = {
                        emptySection: true,
                        variable,
                        children: []
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
                    let pipeIndex = template.indexOf(PIPE_DELIMITER, cursor)
                    if(pipeIndex == -1) throw "Malformed template"
                    if(pipeIndex >= closingIndex) throw "Malformed template"
                    variable = template.substring(openingIndex+2, pipeIndex).trim() // rectify
                    let pipe = template.substring(pipeIndex+1, closingIndex).trim()
                    tree.children.push({
                        variable,
                        pipe
                    })
                    ancestorChain.push(tree)
                }; break;
            }
            
            cursor = closingIndex + CLOSING_TOKEN.length
        } else {
            tree.children.push({
                slice: template.substring(cursor, template.length)
            })
            
            cursor = template.length // loop is over, so break is not required
        }
    }
    
    return root;
}


function* iterativeMake(treeNode, scope, elementUuids, elementUuid, childSequence) {
    if(!scope) yield ''
    let variable = treeNode.variable
    
    if(treeNode.slice != null) {
        yield treeNode.slice
    } else if(treeNode.section) {
        if(!variable) {
            if(elementUuid)
                throw "Nested identification blocks are forbidden"
            
            elementUuid = treeNode.elementUuid
            let sequenceHash = childSequence.join("_")
            let identifier = `${elementUuid}-${sequenceHash}`
            
            if(elementUuids.has(identifier))
                throw "Logical error: identifier already exists"
            
            elementUuids.set(identifier, [])
            
            yield ` ${IDENTIFICATION_ATTRIBUTE}="${identifier}" `
            
            for(let childNode of treeNode.children) {
                yield* iterativeMake(childNode, scope, elementUuids, elementUuid, childSequence)
            }
        } else if(Object.hasOwn(scope, variable)) {
            scope = scope[variable]
            if(typeof scope[Symbol.iterator] === 'function') {
                childSequence.push(0)
                for(let record of scope) {
                    for(let childNode of treeNode.children) {
                        yield* iterativeMake(childNode, record, elementUuids, elementUuid, childSequence)
                    }
                    childSequence[childSequence.length - 1] += 1
                }
                childSequence.pop()
            } else {
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuids, elementUuid, childSequence)
                }
            }
        }
    } else if(treeNode.emptySection) {
        if(variable && Object.hasOwn(scope, variable)) {
            scope = scope[variable]
            guard: {
                try {
                    for(let record of scope) break guard
                } catch(error) { console.error(error); break guard }
                
                childSequence.push('-1')
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, record, elementUuids, elementUuid, childSequence)
                }
                childSequence.pop()
            }
        }
    } else if(treeNode.positiveConditional) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(typeof scope[variable] === 'boolean' && scope[variable] === true) {
                childSequence.push('t')
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuids, elementUuid, childSequence)
                }
                childSequence.pop()
            }
        }
    } else if(treeNode.negativeConditional) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(typeof scope[variable] === 'boolean' && scope[variable] === false) {
                childSequence.push('f')
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuids, elementUuid, childSequence)
                }
                childSequence.pop()
            }
        }
    } else if(treeNode.event) {
        if(variable) {
            let attribute = HANDLED_EVENTS.get(variable)
            if(attribute && Object.hasOwn(scope, attribute)) {
                let handler = scope[attribute].bind(scope)
                
                let sequenceHash = childSequence.join("_")
                let identifier = `${elementUuid}-${sequenceHash}`
            
                elementUuids.get(identifier).push(
                    _ => _['on'+variable] = handler
                )
            }
        }
    } else if(treeNode.textContent) {
        if(variable && Object.hasOwn(scope, variable)) {
            let value = scope[variable]
            
            let sequenceHash = childSequence.join("_")
            let identifier = `${elementUuid}-${sequenceHash}`
            
            elementUuids.get(identifier).push(
                _ => (_.textContent = value)
            )
        }
    } else if(treeNode.pipe) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(treeNode.pipe === 'class') {
                if(!!scope[variable]) {
                    var sideEffect = _ => _.classList.add(variable)
                } else {
                    var sideEffect = _ => _.classList.remove(variable)
                }
            } else {
                let value = scope[variable]
                var sideEffect = _ => _.setAttribute(treeNode.pipe, value)
            }
            
            let sequenceHash = childSequence.join("_")
            let identifier = `${elementUuid}-${sequenceHash}`
            
            elementUuids.get(identifier).push(sideEffect)
        }
    } else if(treeNode.root) {
        for(let childNode of treeNode.children) {
            yield* iterativeMake(childNode, scope, elementUuids, elementUuid, childSequence)
        }
    } else {
        throw "Kawabunga, we are on a node we cannot handle?"
    }
}


function compile(template) {
    let root = generateTreeFromExpression(template)
    
    const hydrate = (domRoot, scope) => {
        let elementUuids = new Map()
        let rawHTML = [
            ...iterativeMake(root, scope, elementUuids, undefined, [])
        ].join("")
        domRoot.innerHTML = rawHTML
        for(let [uuid, sideEffects] of elementUuids) {
            for(let sideEffect of sideEffects) {
                sideEffect(domRoot.querySelector(`*[${IDENTIFICATION_ATTRIBUTE}=${uuid}]`))
            }
        }
        
        return {}
    }
    
    return { hydrate }
}


export { compile }
