const makeElement = (type, props, ...children) => {
  const element = {
    type,
    props: {
      ...props,
      children: children.map(child =>
        typeof child === "object"
          ? child
          : makeTextElement(child)
      )
    }
  }
  return element
}

const makeTextElement = (text) => {
  const textElement = {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: []
    }
  }
  return textElement
}

const makeDom = (fiber) => {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type)
  updateDom(dom, {}, fiber.props)
  return dom
}

const isEvent = (key) => key.startsWith("on")
const isProperty = (key) => key !== "children" && !isEvent(key)
const isNew = (prev, next) => (key) => prev[key] !== next[key]
const isGone = (prev, next) => (key) => !(key in next)
  
const updateDom = (dom, prevProps, nextProps) => {
  // remove old/chnaged event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) =>
      !(key in nextProps) ||
      isNew(prevProps, nextProps)(key)
    )
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      dom.removeEventListener(eventType, prevProps[name])
    })
  // remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => dom[name] = "")
  // set new/changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => dom[name] = nextProps[name])
  // add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      dom.addEventListener(eventType, nextProps[name])
    })
}

const commitRoot = () => {
  deletions.forEach(commitWork)
  commitWork(wipRoot.child)
  currentRoot = wipRoot
  wipRoot = null
}

const commitWork = (fiber) => {
  if (!fiber) return

  let domParentFiber = fiber.parent
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent
  }
  const domParent = domParentFiber.dom

  if (
    fiber.effectTag === "PLACEMENT" && 
    fiber.dom != null
  ) {
    domParent.appendChild(fiber.dom)
  } else if (
    fiber.effectTag === "UPDATE" && 
    fiber.dom != null
  ) {
    updateDom(
      fiber.dom,
      fiber.alternate.props,
      fiber.props
    )
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent)
  }

  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

const commitDeletion = (fiber, domParent) => {
  if (fiber.dom) domParent.removeChild(fiber.dom)
  else commitDeletion(fiber.child, domParent)
}

const render = (element, container) => {
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternative: currentRoot
  }
  deletions = []
  nextTask = wipRoot
}

let nextTask = null
let currentRoot = null
let wipRoot = null
let deletions = null

const taskLoop = (deadline) => {
  let shouldYield = false
  while (nextTask && !shouldYield) {
    nextTask = performTask(nextTask)
    shouldYield = deadline.timeRemaining() < 1
  }

  if (!nextTask && wipRoot) commitRoot()

  // Creates loop and browser will run when main thread is idle
  requestIdleCallback(taskLoop)
}

requestIdleCallback(taskLoop)

const performTask = (fiber) => {
  const isFunctionComponent = fiber.type instanceof Function
  if (isFunctionComponent) updateFunctionComponent(fiber)
  else updateHostComponent(fiber)

  if (fiber.child) return fiber.child

  let nextFiber = fiber
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling
    }
    nextFiber = nextFiber.parent
  }
}

let wipFiber = null
let hookIndex = null

const updateFunctionComponent = (fiber) => {
  wipFiber = fiber
  hookIndex = 0
  wipFiber.hooks = []
  const children = [fiber.type(fiber.props)]
  reconcileChildren(fiber, children)
}

const useState = (initial) => {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex]
  
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  }

  const actions = oldHook ? oldHook.queue : []
  actions.forEach((action) => {
    hook.state = action(hook.state)
  })

  const setState = (action) => {
    hook.queue.push(action)
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    }
    nextTask = wipRoot
    deletions = []
  }

  wipFiber.hooks.push(hook)
  hookIndex++
  return [hook.state, setState]
}

const updateHostComponent = (fiber) => {
  if (!fiber.dom) fiber.dom = makeDom(fiber)
  reconcileChildren(fiber, fiber.props.children)
}

const reconcileChildren = (wipFiber, elements) => {
  let index = 0
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child
  let prevSibling = null

  while (
    index < elements.length ||
    oldFiber != null
  ) {
    const element = elements[index]
    let newFiber = null

    const sameType = (
      oldFiber &&
      element &&
      element.type === oldFiber.type
    )
    // Update this node
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE"
      }
    }
    // Add this node
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT"
      }
    }
    // Delete this node
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION"
      deletions.push(oldFiber)
    }
    if (oldFiber) oldFiber = oldFiber.sibling
    if (index === 0) wipFiber.child = newFiber
    else if (element) prevSibling.sibling = newFiber

    prevSibling = newFiber
    index++
  }
}

const Dome = {
  makeElement,
  render,
  useState
}

/** @jsx Dome.makeElement */
const Counter = () => {
  const [count, setCount] = Dome.useState(1)
  return (
    <button class="p-30" onClick={() => setCount((c) => c + 1)} style={{}}>
      {count}
    </button>
  )
}

const Layout = (props) => {
  return (
    <div class="bg">
      {props.children}
    </div>
  )
}

/** @jsx Dome.makeElement */
const App = () => {
  return (
    <Layout>
      <Counter />
    </Layout>
  )
}

const element = <App />
const container = document.getElementById("root")
Dome.render(element, container)

  /* 
    Note on 'concurency' for prev renderer function:
    The commented out code below contains a recursive call,
    although this works, it will continue to run until the entire
    element tree as been rendered; this may block the main thread if
    the element tree is too large. The following function breaks this
    down in a way the browser is able to interupt if needed.
    element.props.children.forEach(child => render(child, dom))
  */