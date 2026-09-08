import type { PrioritizeInput } from "./schema";

export const demoInput: PrioritizeInput = {
  people: 5,
  workdays: 10,
  success: "商家能报名、运营能审核、活动能上线",
  requirements: [
    { id: "r1", name: "商家报名表", desc: "商家填写活动报名信息并提交", estimateDays: 3 },
    { id: "r2", name: "运营审核", desc: "运营通过或驳回报名", estimateDays: 2 },
    { id: "r3", name: "活动上线开关", desc: "审核通过后活动可上线", estimateDays: 1 },
    { id: "r4", name: "报名数据导出", desc: "运营导出报名名单", estimateDays: 1 },
    { id: "r5", name: "短信提醒", desc: "报名结果短信通知商家", estimateDays: 2 },
    { id: "r6", name: "报名页装修", desc: "可配置报名页头图和文案", estimateDays: 3 },
    { id: "r7", name: "报名排行榜", desc: "按报名量展示排行", estimateDays: 3 },
    { id: "r8", name: "和优惠券打通", desc: "报名成功发优惠券", estimateDays: 5 },
    { id: "r9", name: "多语言", desc: "报名页中英切换", estimateDays: 4 },
    { id: "r10", name: "管理后台数据大屏", desc: "报名实时大盘", estimateDays: 5 },
    { id: "r11", name: "商家端消息中心", desc: "站内信列表", estimateDays: 4 },
    { id: "r12", name: "报名审批钉钉通知", desc: "有新报名时钉钉提醒运营", estimateDays: 1 },
  ],
};
