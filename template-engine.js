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

const OPENING_TOKEN = '{{'
const CLOSING_TOKEN = '}}'

const SECTION_MARKER = '#'
const EMPTY_SECTION_MARKER = '^'
const IF_BLOCK_MARKER = '?'
const ELSE_BLOCK_MARKER = ':'
const TEXT_CONTENT_MARKER = '§'
const TOKEN_MARKER  = '_'
const EVENT_MARKER = '%'
const PIPE_DELIMITER = '|'
const END_OF_BLOCK = '/'

const IDENTIFICATION_ATTRIBUTE = 'data-uuid'


function generateTreeFromExpression(template) {
    let root = {
        children: []
    }
    
    let cursor = 0
    let tree = root
    for(;cursor < template.length;) {
        let openingIndex = template.indexOf(OPENING_TOKEN, cursor)
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
                        parent: tree,
                        section: true,
                        variable,
                        children: []
                    }
                    tree.children.push(nextTree)
                    tree = nextTree
                }; break;
                case EMPTY_SECTION_MARKER: {
                    let nextTree = {
                        parent: tree,
                        emptySection: true,
                        variable,
                        children: []
                    }
                    tree.children.push(nextTree)
                    tree = nextTree
                }; break;
                case IF_BLOCK_MARKER: {
                    let nextTree = {
                        parent: tree,
                        positiveConditional: true,
                        variable,
                        children: []
                    }
                    tree.children.push(nextTree)
                    tree = nextTree
                }; break;
                case ELSE_BLOCK_MARKER: {
                    let nextTree = {
                        parent: tree,
                        negativeConditional: true,
                        variable,
                        children: []
                    }
                    tree.children.push(nextTree)
                    tree = nextTree
                }; break;
                case TOKEN_MARKER: {
                    tree.children.push({
                        placeholder: true,
                        variable
                    })
                }; break;
                case EVENT_MARKER: {
                    tree.children.push({
                        event: true,
                        variable
                    })
                }; break;
                case TEXT_CONTENT_MARKER: {
                    tree.children.push({
                        textContent: true,
                        variable
                    })
                }; break;
                case END_OF_BLOCK: {
                    tree = tree.parent
                }; break;
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
                }; break;
            }
            
            cursor = closingIndex + CLOSING_TOKEN.length
        } else {
            tree.children.push({
                slice: template.substring(cursor, template.length)
            })
            
            cursor = template.length
        }
    }
    
    return root;
}


function* iterativeMake(treeNode, scope, elementUuids, elementUuid) {
    if(!scope) yield ''
    let variable = treeNode.variable
    
    if(treeNode.placeholder) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(!!scope[variable]) yield variable
        }
    } else if(treeNode.slice != null) {
        yield treeNode.slice
    } else if(treeNode.section) {
        if(!variable) {
            let elementUuid; do {
                elementUuid = 'uuid'+parseInt(Math.random() * 100_000_000)
            } while(elementUuids.has(elementUuid))
            elementUuids.set(elementUuid, [])
            
            yield ` ${IDENTIFICATION_ATTRIBUTE}="${elementUuid}" `
            
            for(let childNode of treeNode.children) {
                yield* iterativeMake(childNode, scope, elementUuids, elementUuid)
            }
        } else if(Object.hasOwn(scope, variable)) {
            scope = scope[variable]
            if(typeof scope[Symbol.iterator] === 'function') {
                for(let record of scope) {
                    for(let childNode of treeNode.children) {
                        yield* iterativeMake(childNode, record, elementUuids, elementUuid)
                    }
                }
            } else {
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuids, elementUuid)
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
                
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, record, elementUuids, elementUuid)
                }
            }
        }
    } else if(treeNode.positiveConditional) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(typeof scope[variable] === 'boolean' && scope[variable] === true) {
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuids, elementUuid)
                }
            }
        }
    } else if(treeNode.negativeConditional) {
        if(variable && Object.hasOwn(scope, variable)) {
            if(typeof scope[variable] === 'boolean' && scope[variable] === false) {
                for(let childNode of treeNode.children) {
                    yield* iterativeMake(childNode, scope, elementUuids, elementUuid)
                }
            }
        }
    } else if(treeNode.event) {
        if(variable) {
            let attribute = HANDLED_EVENTS.get(variable)
            if(attribute && Object.hasOwn(scope, attribute)) {
                let handler = scope[attribute].bind(scope)
                elementUuids.get(elementUuid).push(
                    _ => _['on'+variable] = handler
                )
            }
        }
    } else if(treeNode.textContent) {
        if(variable && Object.hasOwn(scope, variable)) {
            let value = scope[variable]
            elementUuids.get(elementUuid).push(
                _ => (_.textContent = value)
            )
        }
    } else if(treeNode.pipe) {
        if(variable && Object.hasOwn(scope, variable)) {
            let value = scope[variable]
            elementUuids.get(elementUuid).push(
                _ => _.setAttribute(treeNode.pipe, value)
            )
        }
    } else {
        for(let childNode of treeNode.children) {
            yield* iterativeMake(childNode, scope, elementUuids, elementUuid)
        }
    }
}

function compile(template) {
    let root = generateTreeFromExpression(template)
    
    return scope => {
        let elementUuids = new Map()
        let rawHTML = [
            ...iterativeMake(root, scope, elementUuids, undefined)
        ].join("")
        
        let hydrate = domRoot => {
            domRoot.innerHTML = rawHTML
            for(let [uuid, sideEffects] of elementUuids) {
                for(let sideEffect of sideEffects) {
                    sideEffect(domRoot.querySelector(`*[${IDENTIFICATION_ATTRIBUTE}=${uuid}]`))
                }
            }
        }
        return { hydrate }
    }
}


export { compile }
