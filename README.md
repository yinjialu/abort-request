# 自动取消过期的请求

## 使用方式

安装

```shell
npm i --save abort-request
```

-   优化前默认版本：

```ts
import { watch, ref, unref } from 'vue';

// 请求方法
const getDataAPI = ({ params }: { params: { id: string } }) => {
    // 发起请求
};

const id = ref();
const detail = ref();

// 调用请求方法，handleQuery 可能多次调用，detail 数据是最新的吗？
const handleQuery = () => {
    getDataAPI({ params: { id: unref(id) } }).then((res) => {
        detail.value = res;
    });
};

watch(id, () => {
    handleQuery();
});
```

### 优化版本 - 避免竞态冲突，detail 总是最新值

```ts
import { createAutoAbortExpiredRequest, isAbortError } from 'abort-request';

// 请求方法
const getDataAPI = ({ params }: { params: { id: string } }) => {
    // 发起请求
};

const id = ref();
const detail = ref();

// 创建这个请求方法的自动取消版本
const getDataAPIAutoAbort = createAutoAbortExpiredRequest(getDataAPI);

const handleQuery = () => {
    // 使用 getDataAPIAutoAbort 替代 getDataAPI 进行调用，传参方式不变
    getDataAPIAutoAbort({ params: { id: unref(id) } }).then((res) => {
        // 当多次调用时，未完成的请求被自动取消，不会进入 then 逻辑
        detail.value = res;
    });
};

watch(id, () => {
    handleQuery();
});
```

### 避免阻塞浏览器 - 如果旧请求还未完成，就取消

XHR 和 Fetch 都支持传入 signal 用于中止请求，可以按照当前项目的封装方式，确定传入 signal 的方法，axios 配置参考：[signal: new AbortController().signal](<https://github.com/axios/axios#:~:text=signal%3A%20new%20AbortController().signal%2C>)

```ts
// 以 logan 为例
const getDataAPI = ({
    params,
    signal,
}: {
    params: { id: string };
    signal?: AbortSignal;
}) => {
    // 发起请求
};

const handleQuery = () => {
    // getDataAPIAutoAbort 可以接受一个函数作为参数，这个函数接受 signal 参数，组装好 signal 后，返回一个数组，用做请求参数
    getDataAPIAutoAbort(({ signal }) => [
        { params: { id: unref(id) }, signal },
    ]).then((res) => {
        // 当多次调用时，未完成的请求被自动取消，不会进入 then 逻辑
        detail.value = res;
    });
};
```

效果如下：

未完成的请求会被取消，新发起的请求会立即开始
![abort request](./docs/abortrequest.png)

### 处理 loading 状态

```ts
const handleQuery = () => {
    loading.value = true;
    getDataAPIAutoAbort(({ signal }) => [{ params: { id: unref(id) }, signal }])
        .then((res) => {
            // 当多次调用时，未完成的请求被自动取消，不会进入 then 逻辑
            detail.value = res;
            loading.value = false;
        })
        .catch((err) => {
            // 判断不是取消请求的错误
            if (!isAbortError(err)) {
                loading.value = false;
            }
        });

    // 不能在 finally 中处理 loading 状态
};
```
