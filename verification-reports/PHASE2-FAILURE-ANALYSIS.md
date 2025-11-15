# Phase 2 失败分析报告

**时间**: 2025-11-15 21:45
**Run ID**: 19390687754
**状态**: ❌ 失败

---

## 失败原因

### CodeDeploy 错误

**阶段**: BeforeInstall
**脚本**: `deploy/hooks/before_install.sh`
**错误**: ECR 拉取镜像失败

**错误日志**:
```
Error response from daemon: pull access denied for 
381492069474.dkr.ecr.ap-southeast-1.amazonaws.com/user-auth, 
repository does not exist or may require 'docker login': 
denied: User: arn:aws:sts::585891120210:assumed-role/optima-prod-ec2-ecr-pull/i-0675af8af31794014 
is not authorized to perform: ecr:BatchGetImage on resource: 
arn:aws:ecr:ap-southeast-1:381492069474:repository/user-auth
```

### 根本原因

**deploy/hooks/before_install.sh** 第 8 行硬编码了**错误的 ECR 账号**:

```bash
ECR_REGISTRY="381492069474.dkr.ecr.ap-southeast-1.amazonaws.com"  # ❌ 错误账号
```

**正确的 ECR 账号应该是**:
```bash
ECR_REGISTRY="585891120210.dkr.ecr.ap-southeast-1.amazonaws.com"  # ✓ 正确
```

**IAM 角色**: `arn:aws:sts::585891120210:...` (账号 585891120210)
**尝试访问**: 账号 381492069474 的 ECR（没有权限）

---

## 影响范围

**失败的钩子**: BeforeInstall（预拉取镜像）
**后续钩子**: 全部跳过（Install, AfterInstall, ApplicationStart, ValidateService）

**服务影响**: 
- ✅ 旧服务仍在运行（零停机设计生效）
- ❌ 新版本未部署

---

## 修复方案

### 立即修复

**文件**: `deploy/hooks/before_install.sh`

**修改**:
```bash
# 第 8 行
ECR_REGISTRY="585891120210.dkr.ecr.ap-southeast-1.amazonaws.com"
```

**同时检查其他 hooks**:
- `deploy/hooks/after_install.sh`
- `deploy/hooks/application_start.sh`
- `deploy/hooks/validate_service.sh`

确保所有钩子中的 ECR_REGISTRY 都正确。

---

## 验证清单

修复后需要验证：

- [ ] deploy/hooks/before_install.sh ECR_REGISTRY 正确
- [ ] deploy/hooks/after_install.sh ECR_REGISTRY 正确
- [ ] deploy/hooks/application_start.sh ECR_REGISTRY 正确
- [ ] 所有钩子脚本有执行权限
- [ ] appspec.yml 指向正确的钩子路径

---

## 下一步

1. 修复 ECR_REGISTRY 硬编码
2. 提交到 feature 分支
3. 重新触发部署
4. 继续 Phase 2 验证

**状态**: 问题已定位，准备修复
