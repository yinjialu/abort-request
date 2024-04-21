type Request = (...arg: any[]) => Promise<any>;

/**
 * Recursively unwraps the "awaited type" of a type. Non-promise "thenables" should resolve to `never`. This emulates the behavior of `await`.
 */
type Awaited<T> = T extends null | undefined
    ? T // special case for `null | undefined` when not in `--strictNullChecks` mode
    : T extends object & { then(onfulfilled: infer F, ...args: infer _): any } // `await` only unwraps object types with a callable `then`. Non-object types are not unwrapped
    ? // eslint-disable-next-line @typescript-eslint/no-shadow
      F extends (value: infer V, ...args: infer _) => any // if the argument to `then` is callable, extracts the first argument
        ? Awaited<V> // recursively unwrap the value
        : never // the argument to `then` was not callable
    : T; // non-object or non-thenable

type AbortAbleRequest<
    R extends Request,
    P extends Parameters<R>,
    S extends Awaited<ReturnType<R>>
> = {
    (...arg: P): Promise<S>;
    abort: () => void;
    signal: AbortSignal;
};

export const isAbortError = (error: any) => {
    return error.name === 'AbortError';
};

// todo 支持 options 传入自定义配置，比如 abort reason 参数
export const createAbortAbleRequest = <
    R extends Request,
    P extends Parameters<R>,
    S extends Awaited<ReturnType<R>>
>(
    request: R
): AbortAbleRequest<R, P, S> => {
    const abortControl = new AbortController();
    const signal = abortControl.signal;
    const abort = () => {
        abortControl.abort();
    };

    const fun = (...arg: P): Promise<S> => {
        if (signal.aborted)
            return Promise.reject(new DOMException('Aborted', 'AbortError'));
        return new Promise<S>((resolve, reject) => {
            signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
            });
            request(...arg)
                .then((res: S) => {
                    resolve(res);
                })
                .catch((err) => {
                    reject(err);
                });
        });
    };
    fun.abort = abort;
    fun.signal = signal;
    return fun;
};

export const createAutoAbortExpiredRequest = <
    R extends Request,
    P extends Parameters<R>,
    S extends Awaited<ReturnType<R>>
>(
    request: R
) => {
    let cleanup: () => void;

    type ArgFunT = ({ signal }: { signal: AbortSignal }) => P;

    // todo 这里的函数签名，在外部无法获取正确的推断
    type AutoAbortExpiredRequest = {
        (...args: P): Promise<S>;
        (argFun: ArgFunT): Promise<S>;
        abort: () => void;
    };

    const autoAbortExpiredRequest: AutoAbortExpiredRequest = (...arg) => {
        const abortAbleReQuest = createAbortAbleRequest(request);

        // 约定传入的参数是函数且只有一个时，可以接收 signal 参数
        const getArg = (): P => {
            if (typeof arg[0] === 'function' && arg.length === 1) {
                const signal = abortAbleReQuest.signal;
                const argFun = arg[0] as ArgFunT;
                return argFun({ signal });
            }
            return arg as P;
        };

        // 如果存在需要取消的请求，先取消
        if (cleanup) {
            cleanup();
        }

        // 请求发起时会注册一个用于取消请求的函数
        cleanup = () => {
            abortAbleReQuest.abort();
        };

        const requestArg = getArg();

        return abortAbleReQuest(...requestArg);
    };
    // 支持手动调用取消未完成的请求
    autoAbortExpiredRequest.abort = () => {
        cleanup();
    };
    return autoAbortExpiredRequest;
};
