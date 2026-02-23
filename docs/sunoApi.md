查询积分余额
系统通用

0免费
查询当前商户的积分余额。此接口不消耗积分，可随时调用查看账户余额。

官方价格: 0免费
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
响应说明
响应说明：

code: 状态码，200 表示成功
message: 响应消息
data.remaining_points: 剩余积分数量
成功响应示例
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "remaining_points": 1000
  }
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X GET "https://open.suno.cn/api/v1/points/balance" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用




生成音乐
SUNO

0.36¥/次
Suno 核心接口。支持"灵感模式"（仅需描述）与"自定义模式"（需填歌词/风格/标题）。包含生成、延长、翻唱功能。一次生成两首歌。

官方价格: 1¥/次
节省 64%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
gpt_description_prompt 【灵感模式】音乐描述 (如: "一首欢快的流行歌")。与 prompt 二选一。
prompt 【自定义模式】歌词内容。V4限3000字，V5限5000字。
tags 【自定义模式】音乐风格 (如: "pop, rock")。V4限200字，V5限1000字。
negative_tags 排除的风格提示词
mv *模型版本

title *歌名。V4限80字，V5限100字。
make_instrumental *是否纯音乐 (无歌词)

false
task 操作类型：不传默认生成，可选：extend (延长), cover (翻唱)

continue_clip_id 【延长模式】被延长的歌曲ID
continue_at 【延长模式】从第几秒开始延长
cover_clip_id 【翻唱模式】原歌曲ID
metadata 高级参数 (如 vocal_gender, audio_weight 等)
{
  "vocal_gender": "f",
  "control_sliders": {
    "style_weight": 0.87,
    "weirdness_constraint": 0.75
  }
}
参数说明
模式选择
灵感模式: 使用 gpt_description_prompt 参数，只需描述音乐风格，系统会自动生成歌词
自定义模式: 使用 prompt 参数，需要提供完整的歌词内容
metadata 高级参数说明
vocal_gender: 可选， 男声传m，女声传f
style_weight: 风格参考度
weirdness_constraint: 怪异约束度
audio_weight: 音频参考度(仅上传的音乐后续操作延长和翻唱能用这个参数)
task 参数说明
不传 task 参数：默认生成新音乐
task=extend: 延长模式，需要提供 continue_clip_id 和 continue_at
task=cover: 翻唱模式，需要提供 cover_clip_id
响应说明
响应说明：

data: 任务ID数组 (包含2个ID，分别对应生成的2首歌曲)
success: 请求状态
成功响应示例
{
  "code": 200,
  "data": [
    199824,
    199825
  ],
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/generate" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json" \
  -d '{
  "make_instrumental": false,
  "metadata": {
    "vocal_gender": "f",
    "control_sliders": {
      "style_weight": 0.87,
      "weirdness_constraint": 0.75
    }
  }
}'
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用



查询音乐任务
SUNO

0免费
查询音乐生成任务的状态和结果

官方价格: 0免费
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
id *任务ID
响应说明
返回说明：

status：1排队中 2生成中 3任务成功 4任务失败
errormsg：任务失败原因
errormsgEn：任务失败原因（英文）
custom_id 是当前任务的suno音乐id
extend：suno官方返回的原始数据，json字符串，两首歌，其中一个是当前任务，custom_id字段是当前任务的suno音乐id，通过custom_id在extend字段查找当前suno任务
成功响应示例
{
  "code": 200,
  "data": {
    "id": 199824,
    "status": 3,
    "fileInfo": {
      "mp4Url": "https://t.bmnmny.cn/ai/340c1748-3fd7-42dc-a627-4eccdd47a164.mp4",
      "mp3Url": "https://t.bmnmny.cn/ai/f72840f3-9d8f-4030-82b1-151aef4180b5.mp3",
      "coverUrl": "https://t.bmnmny.cn/ai/db38c91f-f962-43aa-a1ad-2031ec364150.png"
    },
    "custom_id": "0f65a62b-3c55-4af6-8353-56be806b93d2",
    "extend": "[....]",
    "success": true,
    "message": "请求成功"
  }
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X GET "https://open.suno.cn/api/v1/music/task" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用





批量查询音乐任务
SUNO

0免费
批量查询多个音乐生成任务的状态

官方价格: 0免费
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
ids *任务IDs，用逗号分隔，如：199824,199825
page 页码
1
size 每页数量
10
响应说明
返回数据的data.rows[]数组中，每个元素的结构与单个查询音乐任务的返回数据相同

🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X GET "https://open.suno.cn/api/v1/music/tasks" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用


上传参考音频
SUNO

0.01¥/次
上传参考音频用于后续操作（延长、翻唱等）

官方价格: 0.1¥/次
节省 90%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
audio_url *音频地址URL
响应说明
data: 单个任务ID 调用查询音乐任务接口查询结果，结果与单个音乐任务相似
成功响应示例
{
  "code": 200,
  "data": 1344761,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/upload" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用



获取整首歌
SUNO

0.01¥/次
获取整首歌曲

官方价格: 0.3¥/次
节省 97%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
clip_id *suno的音乐ID（最后一次生成音乐的suno音乐id）【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
响应说明
data: 单个任务ID，生成一首歌 调用查询音乐任务接口查询结果，结果与单个音乐任务相似
成功响应示例
{
  "code": 200,
  "data": 1344761,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/whole-song" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用


获取歌词时间戳
SUNO

0.01¥/次
获取歌词的时间戳对齐信息。

官方价格: 0.2¥/次
节省 95%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
lyrics *歌词内容
suno_id *suno的id（必须是已经生成完成的歌曲，否则会失败）【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
参数说明
    - **调用该接口的歌曲，必须是已经生成完成的歌曲，否则会失败**
    
响应说明
data: 单个任务ID 调用查询音乐任务接口查询结果
生成结果通过"查询任务接口"接口查询,当任务状态是3的时候,在extend字段里是生成的结果,示例如下：
{
        "state": "complete",
        "alignment": [
        {
          "word": "[Intro]\n\n\n[Verse]\n最",
          "success": true,
          "start_s": 0.6382978723404256,
          "end_s": 1.0372340425531914,
          "p_align": 1
        },
        {
          "word": "近",
          "success": true,
          "start_s": 1.0372340425531914,
          "end_s": 1.1170212765957448,
          "p_align": 1
        },
        {
          "word": "的",
          "success": true,
          "start_s": 1.5159574468085106,
          "end_s": 1.5957446808510638,
          "p_align": 1
        },
        ...
        ]
      }
成功响应示例
{
  "code": 200,
  "data": 1344761,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/aligned-lyrics" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用


Remaster音乐
SUNO

0.36¥/次
提升现有音乐的音质 (Remaster)。一次生成两首歌。

官方价格: 1¥/次
节省 64%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
clip_id *suno音乐id（取custom_id字段）【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
model_name *模型名称：v5传chirp-carp, v4.5传chirp-bass, v4传chirp-up

variation_category 只有v5有这个属性，传subtle、normal或high

响应说明
data: 任务ID数组 一次生成两首歌，调用查询音乐任务接口查询结果
成功响应示例
{
  "code": 200,
  "data": [
    199824,
    199825
  ],
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/upsample" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用


生成音乐视频
SUNO

0.01¥/次
为音乐生成视频

官方价格: 0.1¥/次
节省 90%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
task_id *任务id
suno_id *suno音乐id【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
响应说明
data: 单个任务ID 调用查询音乐任务接口查询结果
生成结果通过"查询音乐任务"接口查询,当任务状态是3的时候,在extend字段里是生成的结果,示例如下
{
    "status":"complete",
    "video_url":"https://cdn1.suno.ai/79c8440f-fbc4-4812-a712-b6abfc6ff2cf.mp4"
}
成功响应示例
{
  "code": 200,
  "data": 199824,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/video" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用


转WAV格式
SUNO

0.01¥/次
将音乐转换为WAV格式

官方价格: 0.1¥/次
节省 90%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
task_id *任务id
suno_id *suno音乐id【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
响应说明
data: 单个任务ID 调用查询音乐任务接口查询结果
生成结果通过"查询音乐任务"接口查询,当任务状态是3的时候,在extend字段里是生成的结果,示例如下
{
    "wav_file_url":"https://cdn1.suno.ai/6cc2adb8-711d-43b5-bf40-9058be559764.wav"
}
成功响应示例
{
  "code": 200,
  "data": 199824,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/convert-wav" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用


裁剪音乐
SUNO

0.01¥/次
裁剪音乐片段

官方价格: 0.1¥/次
节省 90%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
clip_id *suno音乐id【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
crop_start_s *裁剪开始时间（秒）
crop_end_s *裁剪结束时间（秒）
响应说明
data: 单个任务ID 生成一首歌 调用查询音乐任务接口查询结果
成功响应示例
{
  "code": 200,
  "data": 199824,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/crop" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json"
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用



调整音乐速度
SUNO

0.01¥/次
调整音乐播放速度

官方价格: 0.1¥/次
节省 90%
API Key
8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi
重置
请求参数
clip_id *suno音乐id【不是纯数字的task_id，是查询音乐任务接口返回结果中的 custom_id 】
speed_multiplier *速度倍数：0.25, 0.5, 0.75, 1, 1.25, 1.5, 2

keep_pitch 是否保持高音

false
title 歌名
响应说明
data: 单个任务ID 生成一首歌 调用查询音乐任务接口查询结果
成功响应示例
{
  "code": 200,
  "data": 199824,
  "success": true,
  "message": "请求成功"
}
🚀 发送请求测试
代码示例
CURL
JAVASCRIPT
PYTHON
PHP
复制代码
curl -X POST "https://open.suno.cn/api/v1/music/speed" \
  -H "Authorization: Bearer 8k95Pp5rVKRB003IGgT6wcIuTtYCdNhi" \
  -H "Content-Type: application/json" \
  -d '{
  "keep_pitch": false
}'
💡 提示: 复制代码后只需替换 API Key 即可在项目中使用