import { observable, action } from 'mobx'
import Taro from '@tarojs/taro'

import formatTime from '../utils/formatTime'

import { SendMessageInfo, ReceiveMessageInfo, LoginInfo, MessageList, ContactsInfo } from '../modals/chatroom'

class chatroomStore {
  /* socket部分 */
  timer: any = null
  @observable socketTask: any = null
  @observable socketId: string = ''
  @observable userName: string = ''
  @observable userAvatar: string = ''
  @observable isReconnected: boolean = false

  /* 消息部分 */
  @observable messageList: MessageList = {}
  @observable scrollViewId: string = ''

  /* 联系人部分 */
  @observable contactsList: ContactsInfo[] = []

  generateSocketId(): void {
    this.socketId = new Date().getTime() + '' + Math.ceil(Math.random() * 100)
  }

  handleSocketOpen(): void {
    const { socketTask } = this
    const loginInfo: LoginInfo = {
      type: 'login',
      socketId: this.socketId,
      userName: this.userName,
      userAvatar: this.userAvatar,
    }
    socketTask.onOpen(() => {
      socketTask.send({ data: JSON.stringify(loginInfo) })
      /* 在成功登陆之后，重置重连标识 */
      this.isReconnected = false
    })
  }

  handleSocketMessage(): void {
    const { socketTask } = this
    socketTask.onMessage(async ({ data }) => {
      const messageInfo: ReceiveMessageInfo = JSON.parse(data)
      const { to, messageId, isMyself, userName, userAvatar, currentTime, message } = messageInfo
      const time: string = formatTime(currentTime)

      this.messageList[to].push({
        ...messageInfo,
        currentTime: time
      })
      /* 设置群组最新消息 */
      this.contactsList.filter(contacts => contacts.contactsId === to)[0].latestMessage = {
        userName, message, currentTime: time
      }
      this.scrollViewId = isMyself ? messageId : ''
      await Taro.request({
        url: 'http://localhost:3000/chatlog',
        method: 'PUT',
        data: {
          to,
          userName,
          userAvatar,
          currentTime,
          message,
        }
      })
    })
  }

  handleSocketClose(): void {
    const { socketTask } = this
    socketTask.onClose((msg) => {
      this.socketTask = null
      this.socketReconnect()
      console.log('onClose: ', msg)
    })
  }

  handleSocketError(): void {
    const { socketTask } = this
    socketTask.onError(() => {
      this.socketTask = null
      this.socketReconnect()
      console.log('Error!')
    })
  }

  async setMessageList(contacts: ContactsInfo[]): Promise<any> {
    await Promise.all(contacts.map(async contactInfo => {
      const { contactsId } = contactInfo
      const { data } = await Taro.request({
        url: `http://localhost:3000/chatlog/${contactsId}`,
        method: 'GET'
      })
      this.messageList[contactsId] = data
    }))
  }

  @action.bound
  async setContactsList() {
    return new Promise(async (resolve, reject) => {
      const { data } = await Taro.request({
        url: 'http://localhost:3000/contacts',
        method: 'GET'
      })
      this.contactsList = data
      this.setMessageList(data)
      resolve()
    })
  }

  @action.bound
  handleMessageSend(messageInfo: SendMessageInfo): void {
    const socketTask: any = this.socketTask
    socketTask.send({ data: JSON.stringify(messageInfo) })
  }

  @action.bound
  setLatestScrollViewId(to: string) {
    const messageInfo = this.messageList[to]
    const { messageId } = messageInfo[messageInfo.length - 1]
    this.scrollViewId = messageId
  }

  @action.bound
  setUserInfo() {
    return new Promise(async (resolve, reject) => {
      const { userInfo: { nickName, avatarUrl } } = await Taro.getUserInfo()
      this.userName = nickName
      this.userAvatar = avatarUrl
      resolve()
    })
  }

  socketReconnect(): void {
    this.isReconnected = true
    clearTimeout(this.timer)

    /* 3s延迟重连，减轻压力 */
    this.timer = setTimeout(() => {
      this.socketConnect()
    }, 3000)
  }

  @action.bound
  async socketConnect() {
    this.generateSocketId()

    /* 使用then的方法才能正确触发onOpen的方法，暂时不知道原因 */
    Taro.connectSocket({
      url: 'ws://localhost:3000',
    }).then(task => {
      this.socketTask = task
      this.handleSocketOpen()
      this.handleSocketMessage()
      this.handleSocketClose()
      this.handleSocketError()
    })
  }
}

export default chatroomStore